using System;
using System.Threading.Tasks;
using FluentAssertions;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services.Agent;
using Xunit;

namespace NineCube.Tests.Agent;

public sealed class IdempotencyTests
{
    private sealed class MutableClock : IClock
    {
        public DateTime UtcNow { get; set; } = new(2026, 11, 7, 22, 0, 0, DateTimeKind.Utc);
    }

    [Fact]
    public async Task New_idempotency_key_is_not_flagged_as_duplicate()
    {
        var clock = new MutableClock();
        var service = new IdempotencyService(clock);

        var isDuplicate = await service.IsDuplicateAsync("idemp:user:1:cart:101:q:1:w:100");
        isDuplicate.Should().BeFalse();
    }

    [Fact]
    public async Task Stored_result_is_returned_and_flagged_as_duplicate()
    {
        var clock = new MutableClock();
        var service = new IdempotencyService(clock);
        const string key = "idemp:user:42:add:48:q:2:w:200";

        var result = TransactionExecutionResult.Success("tx_999", 5);
        await service.StoreResultAsync(key, result);

        var isDuplicate = await service.IsDuplicateAsync(key);
        isDuplicate.Should().BeTrue();

        var cached = await service.GetCachedResultAsync(key);
        cached.Should().NotBeNull();
        cached!.TransactionId.Should().Be("tx_999");
        cached.CartVersion.Should().Be(5);
        cached.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task Expired_idempotency_key_is_evicted_and_not_treated_as_duplicate()
    {
        var clock = new MutableClock();
        var service = new IdempotencyService(clock);
        const string key = "idemp:user:42:add:48:q:2:w:expired";

        var result = TransactionExecutionResult.Success("tx_888", 2);
        await service.StoreResultAsync(key, result, TimeSpan.FromMinutes(5));

        // Advance clock past expiration
        clock.UtcNow = clock.UtcNow.AddMinutes(6);

        var isDuplicate = await service.IsDuplicateAsync(key);
        isDuplicate.Should().BeFalse();

        var cached = await service.GetCachedResultAsync(key);
        cached.Should().BeNull();
    }
}
