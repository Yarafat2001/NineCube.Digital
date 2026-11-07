using System;
using System.Threading.Tasks;
using FluentAssertions;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services.Agent;
using NineCube.Tests.Infrastructure;
using Xunit;

namespace NineCube.Tests.Agent;

public sealed class SecureAuthorizationTests
{
    private sealed class MutableClock : IClock
    {
        public DateTime UtcNow { get; set; } = new(2026, 11, 7, 22, 0, 0, DateTimeKind.Utc);
    }

    [Fact]
    public async Task Nonce_is_issued_with_configurable_lifetime_and_transaction_binding()
    {
        var clock = new MutableClock();
        var service = new SecureAuthorizationService(null!, clock);
        var user = new TestCurrentUser { UserId = 10, CustomerId = 0 };

        var request = new EvaluatePlanRequest("plan_1", "sess_1", "prepare_checkout", null, null, null);
        var binding = await service.CreateBindingAsync(user, request, TimeSpan.FromSeconds(180));

        binding.Should().NotBeNull();
        binding.NonceId.Should().NotBeNullOrWhiteSpace();
        binding.TransactionId.Should().NotBeNullOrWhiteSpace();
        binding.UserId.Should().Be(10);
        binding.ExpiresAtUtc.Should().Be(clock.UtcNow.AddSeconds(180));
    }

    [Fact]
    public async Task Single_use_nonce_can_only_be_consumed_once_preventing_replay()
    {
        var clock = new MutableClock();
        var service = new SecureAuthorizationService(null!, clock);
        var user = new TestCurrentUser { UserId = 25, CustomerId = 0 };

        var request = new EvaluatePlanRequest("plan_2", "sess_2", "authorize_payment", null, null, null);
        var binding = await service.CreateBindingAsync(user, request);

        // First consumption: MUST succeed
        var firstAttempt = await service.ValidateAndConsumeNonceAsync(
            binding.NonceId,
            user.UserId!.Value,
            binding.TransactionId);

        firstAttempt.Should().BeTrue("first consumption of valid nonce must succeed");

        // Replay attempt: MUST fail
        var replayAttempt = await service.ValidateAndConsumeNonceAsync(
            binding.NonceId,
            user.UserId!.Value,
            binding.TransactionId);

        replayAttempt.Should().BeFalse("replaying a consumed nonce must be rejected");
    }

    [Fact]
    public async Task Expired_nonce_is_strictly_rejected()
    {
        var clock = new MutableClock();
        var service = new SecureAuthorizationService(null!, clock);
        var user = new TestCurrentUser { UserId = 30, CustomerId = 0 };

        var request = new EvaluatePlanRequest("plan_3", "sess_3", "authorize_payment", null, null, null);
        var binding = await service.CreateBindingAsync(user, request, TimeSpan.FromSeconds(60));

        // Advance clock past expiration
        clock.UtcNow = clock.UtcNow.AddSeconds(61);

        var consumed = await service.ValidateAndConsumeNonceAsync(
            binding.NonceId,
            user.UserId!.Value,
            binding.TransactionId);

        consumed.Should().BeFalse("expired nonce must be rejected");
    }

    [Fact]
    public async Task Nonce_cannot_be_consumed_by_different_user_or_wrong_transaction()
    {
        var clock = new MutableClock();
        var service = new SecureAuthorizationService(null!, clock);
        var user = new TestCurrentUser { UserId = 50, CustomerId = 0 };

        var request = new EvaluatePlanRequest("plan_4", "sess_4", "prepare_checkout", null, null, null);
        var binding = await service.CreateBindingAsync(user, request);

        // Attacker attempts consumption with different userId
        var attackerAttempt = await service.ValidateAndConsumeNonceAsync(
            binding.NonceId,
            userId: 999,
            transactionId: binding.TransactionId);

        attackerAttempt.Should().BeFalse("nonce bound to user 50 cannot be consumed by user 999");

        // Attempt consumption with mismatched transaction ID
        var wrongTxAttempt = await service.ValidateAndConsumeNonceAsync(
            binding.NonceId,
            userId: 50,
            transactionId: "tx_attacker_fake");

        wrongTxAttempt.Should().BeFalse("nonce bound to transaction cannot be consumed for a different transaction");
    }
}
