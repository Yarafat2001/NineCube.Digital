using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services.Agent;

/// <summary>
/// Orchestrates the autonomous transaction state machine across validation, commit-time checks,
/// forward mutation, postcondition reconciliation, and delta-accurate Saga recovery.
/// </summary>
public sealed class TransactionOrchestrator(
    IAppDbContext db,
    IRiskClassificationService riskClassifier,
    ISecureAuthorizationService authService,
    IIdempotencyService idempotency,
    ICartReconciliationService reconciliation,
    IClock clock) : ITransactionOrchestrator
{
    public async Task<TransactionExecutionResult> ExecuteAsync(
        ICurrentUser user,
        ExecuteTransactionRequest request,
        CancellationToken ct = default)
    {
        var txId = string.IsNullOrWhiteSpace(request.TransactionId)
            ? Guid.NewGuid().ToString("N")
            : request.TransactionId;

        // 1. Idempotency Check
        if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
        {
            if (await idempotency.IsDuplicateAsync(request.IdempotencyKey, ct))
            {
                var cached = await idempotency.GetCachedResultAsync(request.IdempotencyKey, ct);
                if (cached is not null) return cached;
            }
        }

        // 2. Caller Validation
        if (!user.IsAuthenticated || !user.CustomerId.HasValue)
        {
            return TransactionExecutionResult.Rejected(txId, "UNAUTHENTICATED", "Active customer authentication required.");
        }

        var customerId = user.CustomerId.Value;
        var riskTier = riskClassifier.Classify(request.Intent);

        // 3. Tier 3 Nonce Verification
        if (riskTier == 3)
        {
            if (string.IsNullOrWhiteSpace(request.NonceId))
            {
                return TransactionExecutionResult.Rejected(
                    txId,
                    "NONCE_REQUIRED",
                    "Tier 3 high-impact operations require a verified authorization nonce.");
            }

            var isValidNonce = await authService.ValidateAndConsumeNonceAsync(
                request.NonceId,
                user.UserId ?? 0,
                txId,
                ct);

            if (!isValidNonce)
            {
                return TransactionExecutionResult.Rejected(
                    txId,
                    "INVALID_OR_EXPIRED_NONCE",
                    "Authorization nonce is invalid, expired, or was already consumed.");
            }
        }

        // 4. Pre-Execution Validation
        var preSnapshot = await reconciliation.CaptureSnapshotAsync(customerId, ct);

        if (request.ExpectedCartVersion.HasValue && preSnapshot.Version != request.ExpectedCartVersion.Value)
        {
            return TransactionExecutionResult.Aborted(
                txId,
                "CONCURRENT_CART_MODIFICATION",
                $"Cart version has drifted (expected {request.ExpectedCartVersion.Value}, found {preSnapshot.Version}).");
        }

        // 5. Commit-Time Revalidation (Authoritative Product Price & Stock Check)
        var product = await db.Products.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.ProductId, ct);

        if (product is null)
        {
            return TransactionExecutionResult.Aborted(txId, "PRODUCT_NOT_FOUND", $"Product {request.ProductId} was not found.");
        }

        if (!product.IsActive)
        {
            return TransactionExecutionResult.Aborted(txId, "PRODUCT_INACTIVE", $"Product '{product.Name}' is not active.");
        }

        if (product.StockQuantity < request.Quantity)
        {
            return TransactionExecutionResult.Aborted(txId, "INSUFFICIENT_STOCK", $"Requested quantity {request.Quantity} exceeds available stock ({product.StockQuantity}).");
        }

        if (product.Price != request.ExpectedPrice)
        {
            return TransactionExecutionResult.Aborted(
                txId,
                "PRICE_DRIFT_DETECTED",
                $"Price drifted from expected {request.ExpectedPrice} to current authoritative price {product.Price}.");
        }

        // 6. Execute Forward Mutation under Concurrency Lock
        var delta = new CommerceOperationDelta(product.Id, product.Sku, request.Quantity, product.Price);
        var compensationRecord = await reconciliation.RecordForwardMutationAsync(txId, customerId, delta, preSnapshot.Version, ct);

        bool forwardCommitted;
        try
        {
            forwardCommitted = await MutateCartAsync(customerId, product.Id, request.Quantity, ct);
        }
        catch (Exception ex)
        {
            return TransactionExecutionResult.Aborted(txId, "MUTATION_FAILED", ex.Message);
        }

        if (!forwardCommitted)
        {
            return TransactionExecutionResult.Aborted(txId, "DATABASE_LOCK_TIMEOUT", "Failed to commit cart mutation.");
        }

        // 7. Authoritative Postcondition Reconciliation
        var postSnapshot = await reconciliation.CaptureSnapshotAsync(customerId, ct);
        var reconciled = reconciliation.VerifyDelta(preSnapshot, postSnapshot, delta);

        if (!reconciled)
        {
            // Execute Exact-Delta Saga Compensation
            await reconciliation.CompensateDeltaAsync(customerId, compensationRecord, ct);
            var compensationResult = TransactionExecutionResult.Compensated(txId, compensationRecord.OperationId, "Postcondition delta verification failed; rolled back exact transaction delta.");

            if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
            {
                await idempotency.StoreResultAsync(request.IdempotencyKey, compensationResult, null, ct);
            }

            return compensationResult;
        }

        // 8. Success: Store in Idempotency cache and return
        var successResult = TransactionExecutionResult.Success(txId, postSnapshot.Version);

        if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
        {
            await idempotency.StoreResultAsync(request.IdempotencyKey, successResult, null, ct);
        }

        return successResult;
    }

    private async Task<bool> MutateCartAsync(int customerId, int productId, int quantityDelta, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var cart = await db.SavedCarts.SingleOrDefaultAsync(c => c.CustomerId == customerId, ct);
        if (cart is null)
        {
            cart = new SavedCart
            {
                CustomerId = customerId,
                Version = 0,
                ItemsJson = "[]",
                UpdatedAt = clock.UtcNow
            };
            db.SavedCarts.Add(cart);
        }

        var items = JsonSerializer.Deserialize<List<OrderLineRequest>>(cart.ItemsJson) ?? [];
        var existingIndex = items.FindIndex(i => i.ProductId == productId);

        if (existingIndex >= 0)
        {
            var existing = items[existingIndex];
            var newQty = existing.Quantity + quantityDelta;
            if (newQty > 0)
            {
                items[existingIndex] = new OrderLineRequest(productId, newQty);
            }
            else
            {
                items.RemoveAt(existingIndex);
            }
        }
        else if (quantityDelta > 0)
        {
            items.Add(new OrderLineRequest(productId, quantityDelta));
        }

        cart.ItemsJson = JsonSerializer.Serialize(items);
        cart.Version++;
        cart.UpdatedAt = clock.UtcNow;

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}
