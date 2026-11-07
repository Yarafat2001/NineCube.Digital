using System;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;

namespace NineCube.Application.Services.Agent;

/// <summary>
/// Manages cryptographically bound, single-use, expiring authorization nonces for Tier 3 operations.
/// Prevents token hijacking and replay attacks.
/// </summary>
public sealed class SecureAuthorizationService(IAppDbContext db, IClock clock) : ISecureAuthorizationService
{
    private static readonly TimeSpan DefaultNonceLifetime = TimeSpan.FromSeconds(300);
    private readonly ConcurrentDictionary<string, SecureAuthorizationToken> _tokens = new();

    public async Task<ApprovalBindingDto> CreateBindingAsync(
        ICurrentUser user,
        EvaluatePlanRequest request,
        TimeSpan? customTtl = null,
        CancellationToken ct = default)
    {
        var userId = user.UserId ?? 0;
        var customerId = user.CustomerId ?? 0;
        var transactionId = Guid.NewGuid().ToString("N");
        var nonceId = GenerateSecureNonce();

        // Calculate authoritative cart total and version
        var (cartSubtotal, cartVersion, cartHash) = await GetCartStateAsync(customerId, ct);

        var nowUtc = clock.UtcNow;
        var ttl = customTtl ?? DefaultNonceLifetime;
        var expiresAtUtc = nowUtc.Add(ttl);

        var token = new SecureAuthorizationToken(
            NonceId: nonceId,
            TransactionId: transactionId,
            UserId: userId,
            SessionId: request.SessionId ?? "session_default",
            CartHash: cartHash,
            CartVersion: cartVersion,
            Amount: cartSubtotal,
            Currency: "BDT",
            CreatedAtUtc: nowUtc,
            ExpiresAtUtc: expiresAtUtc,
            IsConsumed: false);

        _tokens[nonceId] = token;

        return new ApprovalBindingDto(
            TransactionId: transactionId,
            NonceId: nonceId,
            UserId: userId,
            Amount: cartSubtotal,
            Currency: "BDT",
            ExpiresAtUtc: expiresAtUtc,
            TargetRoute: "/checkout");
    }

    public Task<bool> ValidateAndConsumeNonceAsync(
        string nonceId,
        int userId,
        string transactionId,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(nonceId)) return Task.FromResult(false);

        if (!_tokens.TryGetValue(nonceId, out var token))
        {
            return Task.FromResult(false);
        }

        var nowUtc = clock.UtcNow;

        if (!token.IsValid(userId, transactionId, nowUtc))
        {
            return Task.FromResult(false);
        }

        // Single-use enforcement: Atomically mark token as consumed
        var consumed = token with { IsConsumed = true };
        var updated = _tokens.TryUpdate(nonceId, consumed, token);

        return Task.FromResult(updated);
    }

    public Task<SecureAuthorizationToken?> GetTokenAsync(string nonceId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(nonceId)) return Task.FromResult<SecureAuthorizationToken?>(null);
        _tokens.TryGetValue(nonceId, out var token);
        return Task.FromResult(token);
    }

    private static string GenerateSecureNonce()
    {
        var bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private async Task<(decimal Subtotal, int Version, string CartHash)> GetCartStateAsync(int customerId, CancellationToken ct)
    {
        if (customerId <= 0) return (0m, 0, "empty_cart");

        var cart = await db.SavedCarts.AsNoTracking()
            .SingleOrDefaultAsync(c => c.CustomerId == customerId, ct);

        if (cart is null || string.IsNullOrWhiteSpace(cart.ItemsJson))
        {
            return (0m, 0, "empty_cart");
        }

        var items = JsonSerializer.Deserialize<List<OrderLineRequest>>(cart.ItemsJson) ?? [];
        if (items.Count == 0) return (0m, cart.Version, "empty_cart");

        var productIds = items.Select(i => i.ProductId).ToArray();
        var products = await db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Price, ct);

        decimal subtotal = 0m;
        var hashBuilder = new StringBuilder();
        hashBuilder.Append($"v:{cart.Version}|");

        foreach (var item in items)
        {
            if (products.TryGetValue(item.ProductId, out var price))
            {
                subtotal += price * item.Quantity;
                hashBuilder.Append($"p:{item.ProductId}:q:{item.Quantity}:pr:{price}|");
            }
        }

        using var sha256 = SHA256.Create();
        var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(hashBuilder.ToString()));
        var cartHash = Convert.ToHexString(hashBytes).ToLowerInvariant();

        return (subtotal, cart.Version, cartHash);
    }
}
