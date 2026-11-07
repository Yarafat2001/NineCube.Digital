using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;

namespace NineCube.Application.Services.Agent;

/// <summary>
/// Prevents duplicate mutations across rapid network retries or LLM re-prompting.
/// </summary>
public sealed class IdempotencyService(IClock clock) : IIdempotencyService
{
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(15);

    private sealed record CacheEntry(
        TransactionExecutionResult Result,
        DateTime ExpiresAtUtc);

    private readonly ConcurrentDictionary<string, CacheEntry> _cache = new(StringComparer.OrdinalIgnoreCase);

    public Task<bool> IsDuplicateAsync(string idempotencyKey, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) return Task.FromResult(false);

        if (_cache.TryGetValue(idempotencyKey, out var entry))
        {
            if (clock.UtcNow <= entry.ExpiresAtUtc)
            {
                return Task.FromResult(true);
            }

            // Expired entry
            _cache.TryRemove(idempotencyKey, out _);
        }

        return Task.FromResult(false);
    }

    public Task<TransactionExecutionResult?> GetCachedResultAsync(string idempotencyKey, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) return Task.FromResult<TransactionExecutionResult?>(null);

        if (_cache.TryGetValue(idempotencyKey, out var entry))
        {
            if (clock.UtcNow <= entry.ExpiresAtUtc)
            {
                return Task.FromResult<TransactionExecutionResult?>(entry.Result);
            }

            _cache.TryRemove(idempotencyKey, out _);
        }

        return Task.FromResult<TransactionExecutionResult?>(null);
    }

    public Task StoreResultAsync(
        string idempotencyKey,
        TransactionExecutionResult result,
        TimeSpan? expiration = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) return Task.CompletedTask;

        var ttl = expiration ?? DefaultTtl;
        var expiresAtUtc = clock.UtcNow.Add(ttl);

        _cache[idempotencyKey] = new CacheEntry(result, expiresAtUtc);
        return Task.CompletedTask;
    }
}
