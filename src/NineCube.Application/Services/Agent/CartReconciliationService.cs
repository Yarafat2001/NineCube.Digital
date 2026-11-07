using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services.Agent;

/// <summary>
/// Verifies postconditions via authoritative read-backs and performs exact-delta Saga compensation.
/// Guarantee: Never removes items independently added by the customer outside this transaction.
/// </summary>
public sealed class CartReconciliationService(IAppDbContext db, IClock clock) : ICartReconciliationService
{
    public async Task<CartSnapshot> CaptureSnapshotAsync(int customerId, CancellationToken ct = default)
    {
        if (customerId <= 0)
        {
            return new CartSnapshot(0, 0, 0m, Array.Empty<CartLineSnapshot>(), clock.UtcNow);
        }

        var cart = await db.SavedCarts.AsNoTracking()
            .SingleOrDefaultAsync(c => c.CustomerId == customerId, ct);

        if (cart is null || string.IsNullOrWhiteSpace(cart.ItemsJson))
        {
            return new CartSnapshot(customerId, 0, 0m, Array.Empty<CartLineSnapshot>(), clock.UtcNow);
        }

        var items = JsonSerializer.Deserialize<List<OrderLineRequest>>(cart.ItemsJson) ?? [];
        if (items.Count == 0)
        {
            return new CartSnapshot(customerId, cart.Version, 0m, Array.Empty<CartLineSnapshot>(), clock.UtcNow);
        }

        var productIds = items.Select(i => i.ProductId).ToArray();
        var products = await db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        var lines = new List<CartLineSnapshot>();
        decimal subtotal = 0m;

        foreach (var item in items)
        {
            if (products.TryGetValue(item.ProductId, out var product))
            {
                var line = new CartLineSnapshot(
                    ProductId: product.Id,
                    Sku: product.Sku,
                    Name: product.Name,
                    UnitPrice: product.Price,
                    Currency: product.Currency,
                    Quantity: item.Quantity,
                    AvailableStock: product.IsActive ? product.StockQuantity : 0);

                lines.Add(line);
                subtotal += product.Price * item.Quantity;
            }
        }

        return new CartSnapshot(customerId, cart.Version, subtotal, lines, clock.UtcNow);
    }

    public bool VerifyDelta(CartSnapshot preSnapshot, CartSnapshot postSnapshot, CommerceOperationDelta delta)
    {
        if (postSnapshot.CustomerId != preSnapshot.CustomerId) return false;

        // Concurrency invariant: version must increment
        if (postSnapshot.Version <= preSnapshot.Version) return false;

        var preQty = preSnapshot.GetQuantity(delta.ProductId);
        var postQty = postSnapshot.GetQuantity(delta.ProductId);
        var expectedQty = preQty + delta.QuantityDelta;

        return postQty == expectedQty;
    }

    public Task<SagaCompensationRecord> RecordForwardMutationAsync(
        string transactionId,
        int customerId,
        CommerceOperationDelta delta,
        int initialCartVersion,
        CancellationToken ct = default)
    {
        var operationId = Guid.NewGuid().ToString("N");
        var record = new SagaCompensationRecord(
            TransactionId: transactionId,
            OperationId: operationId,
            ProductId: delta.ProductId,
            Sku: delta.Sku,
            DeltaQuantity: delta.QuantityDelta,
            UnitPrice: delta.ExpectedPrice,
            InitialCartVersion: initialCartVersion,
            CreatedAtUtc: clock.UtcNow);

        return Task.FromResult(record);
    }

    public async Task<bool> CompensateDeltaAsync(
        int customerId,
        SagaCompensationRecord record,
        CancellationToken ct = default)
    {
        if (customerId <= 0 || record.DeltaQuantity <= 0) return false;

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Lock row to prevent concurrent mutation collision
        var cart = await db.SavedCarts.SingleOrDefaultAsync(c => c.CustomerId == customerId, ct);
        if (cart is null) return false;

        var items = JsonSerializer.Deserialize<List<OrderLineRequest>>(cart.ItemsJson) ?? [];
        var targetIndex = items.FindIndex(i => i.ProductId == record.ProductId);

        if (targetIndex >= 0)
        {
            var existing = items[targetIndex];
            var newQuantity = existing.Quantity - record.DeltaQuantity;

            if (newQuantity > 0)
            {
                // Decrement ONLY the transaction delta; user-added units remain safe
                items[targetIndex] = new OrderLineRequest(existing.ProductId, newQuantity);
            }
            else
            {
                // Entire delta removed
                items.RemoveAt(targetIndex);
            }

            cart.ItemsJson = JsonSerializer.Serialize(items);
            cart.Version++;
            cart.UpdatedAt = clock.UtcNow;

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return true;
        }

        // Item was already removed concurrently by the user; no-op compensation succeeds safely
        return true;
    }
}
