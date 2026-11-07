using System;
using System.Threading;
using System.Threading.Tasks;
using NineCube.Application.Contracts;

namespace NineCube.Application.Abstractions;

/// <summary>
/// Server-owned risk classification service for autonomous agent actions.
/// </summary>
public interface IRiskClassificationService
{
    /// <summary>
    /// Classifies an intent string into Tier 1 (Read-only), Tier 2 (Reversible Mutation), or Tier 3 (High-Impact).
    /// Defaults to Tier 3 on unrecognized intents (fail-closed rule).
    /// </summary>
    int Classify(string intent);

    bool IsMutation(string intent);
    bool IsHighImpact(string intent);
    string GetCategory(string intent);
}

/// <summary>
/// Deterministic policy engine that evaluates authorization, rate limits, and risk guardrails.
/// </summary>
public interface ICommercePolicyEngine
{
    Task<PolicyDecision> EvaluateAsync(
        ICurrentUser user,
        EvaluatePlanRequest request,
        int serverAssignedRiskTier,
        CancellationToken ct = default);
}

/// <summary>
/// Issues, manages, and validates single-use cryptographically bound authorization nonces.
/// </summary>
public interface ISecureAuthorizationService
{
    Task<ApprovalBindingDto> CreateBindingAsync(
        ICurrentUser user,
        EvaluatePlanRequest request,
        TimeSpan? customTtl = null,
        CancellationToken ct = default);

    Task<bool> ValidateAndConsumeNonceAsync(
        string nonceId,
        int userId,
        string transactionId,
        CancellationToken ct = default);

    Task<SecureAuthorizationToken?> GetTokenAsync(
        string nonceId,
        CancellationToken ct = default);
}

/// <summary>
/// Prevents duplicate mutations from network retries or conversational re-prompting.
/// </summary>
public interface IIdempotencyService
{
    Task<bool> IsDuplicateAsync(string idempotencyKey, CancellationToken ct = default);

    Task<TransactionExecutionResult?> GetCachedResultAsync(string idempotencyKey, CancellationToken ct = default);

    Task StoreResultAsync(
        string idempotencyKey,
        TransactionExecutionResult result,
        TimeSpan? expiration = null,
        CancellationToken ct = default);
}

/// <summary>
/// Authoritative cart state reconciliation and delta-accurate Saga compensation.
/// </summary>
public interface ICartReconciliationService
{
    Task<CartSnapshot> CaptureSnapshotAsync(int customerId, CancellationToken ct = default);

    bool VerifyDelta(CartSnapshot preSnapshot, CartSnapshot postSnapshot, CommerceOperationDelta delta);

    Task<SagaCompensationRecord> RecordForwardMutationAsync(
        string transactionId,
        int customerId,
        CommerceOperationDelta delta,
        int initialCartVersion,
        CancellationToken ct = default);

    Task<bool> CompensateDeltaAsync(
        int customerId,
        SagaCompensationRecord record,
        CancellationToken ct = default);
}

/// <summary>
/// End-to-end transaction orchestrator managing the finite state machine lifecycle.
/// </summary>
public interface ITransactionOrchestrator
{
    Task<TransactionExecutionResult> ExecuteAsync(
        ICurrentUser user,
        ExecuteTransactionRequest request,
        CancellationToken ct = default);
}
