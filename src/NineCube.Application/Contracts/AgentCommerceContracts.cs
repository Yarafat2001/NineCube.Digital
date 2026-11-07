using System;
using System.Collections.Generic;

namespace NineCube.Application.Contracts;

/// <summary>
/// Candidate intent plan evaluated by the backend policy gate.
/// </summary>
public sealed record EvaluatePlanRequest(
    string PlanId,
    string SessionId,
    string Intent,
    int? TargetProductId,
    int? Quantity,
    decimal? ExpectedPrice,
    Dictionary<string, object>? Context = null);

/// <summary>
/// Authoritative evaluation result returned by the backend policy gate.
/// </summary>
public sealed record PlanEvaluationResponse(
    string Decision, // "allow" | "deny" | "require_user_approval"
    int ServerAssignedRiskTier,
    string PolicyVersion,
    string ReasonCode,
    ApprovalBindingDto? ApprovalBinding);

/// <summary>
/// Cryptographically bound, expiring authorization nonce issued for Tier 3 operations.
/// </summary>
public sealed record ApprovalBindingDto(
    string TransactionId,
    string NonceId,
    int UserId,
    decimal Amount,
    string Currency,
    DateTime ExpiresAtUtc,
    string TargetRoute);

/// <summary>
/// Stored state for a single-use authorization token.
/// </summary>
public sealed record SecureAuthorizationToken(
    string NonceId,
    string TransactionId,
    int UserId,
    string SessionId,
    string CartHash,
    int CartVersion,
    decimal Amount,
    string Currency,
    DateTime CreatedAtUtc,
    DateTime ExpiresAtUtc,
    bool IsConsumed)
{
    public bool IsValid(int userId, string transactionId, DateTime nowUtc) =>
        !IsConsumed &&
        UserId == userId &&
        TransactionId == transactionId &&
        nowUtc <= ExpiresAtUtc;
}

/// <summary>
/// Request to execute an autonomous or approved commerce mutation.
/// </summary>
public sealed record ExecuteTransactionRequest(
    string TransactionId,
    string IdempotencyKey,
    string Intent,
    int ProductId,
    int Quantity,
    decimal ExpectedPrice,
    string? NonceId = null,
    int? ExpectedCartVersion = null);

/// <summary>
/// Authoritative result of a transaction execution.
/// </summary>
public sealed record TransactionExecutionResult(
    string TransactionId,
    bool Succeeded,
    string Status, // "succeeded" | "aborted" | "compensated" | "rejected"
    int CartVersion,
    string? ErrorCode = null,
    string? Message = null,
    string? CompensatedOperationId = null)
{
    public static TransactionExecutionResult Success(string txId, int version) =>
        new(txId, true, "succeeded", version, null, "Operation executed and reconciled successfully.");

    public static TransactionExecutionResult Aborted(string txId, string errorCode, string message) =>
        new(txId, false, "aborted", 0, errorCode, message);

    public static TransactionExecutionResult Compensated(string txId, string operationId, string reason) =>
        new(txId, false, "compensated", 0, "DELTA_MISMATCH_RECOVERED", reason, operationId);

    public static TransactionExecutionResult Rejected(string txId, string reasonCode, string message) =>
        new(txId, false, "rejected", 0, reasonCode, message);
}

/// <summary>
/// Represents the exact delta of a shopping operation.
/// </summary>
public sealed record CommerceOperationDelta(
    int ProductId,
    string Sku,
    int QuantityDelta,
    decimal ExpectedPrice);

/// <summary>
/// Snapshot of a cart line item used for exact read-back verification.
/// </summary>
public sealed record CartLineSnapshot(
    int ProductId,
    string Sku,
    string Name,
    decimal UnitPrice,
    string Currency,
    int Quantity,
    int AvailableStock);

/// <summary>
/// Immutable snapshot of authoritative cart state before or after mutation.
/// </summary>
public sealed record CartSnapshot(
    int CustomerId,
    int Version,
    decimal Subtotal,
    IReadOnlyList<CartLineSnapshot> Lines,
    DateTime TimestampUtc)
{
    public int GetQuantity(int productId)
    {
        for (var i = 0; i < Lines.Count; i++)
        {
            if (Lines[i].ProductId == productId) return Lines[i].Quantity;
        }
        return 0;
    }
}

/// <summary>
/// Persistent record for exact transaction delta compensation.
/// Never removes customer items independently added outside this transaction.
/// </summary>
public sealed record SagaCompensationRecord(
    string TransactionId,
    string OperationId,
    int ProductId,
    string Sku,
    int DeltaQuantity,
    decimal UnitPrice,
    int InitialCartVersion,
    DateTime CreatedAtUtc);

/// <summary>
/// Policy evaluation result from the deterministic policy engine.
/// </summary>
public sealed record PolicyDecision(
    bool IsAllowed,
    bool RequiresApproval,
    string ReasonCode,
    string Message)
{
    public bool IsDenied => !IsAllowed && !RequiresApproval;

    public static PolicyDecision Allow(string reason = "AUTHORIZED_AUTONOMOUS_OPERATION") =>
        new(true, false, reason, "Operation is permitted to execute autonomously.");

    public static PolicyDecision RequireApproval(string reason = "TIER_3_HUMAN_IN_THE_LOOP", string message = "Explicit customer authorization required.") =>
        new(false, true, reason, message);

    public static PolicyDecision Deny(string reason, string message) =>
        new(false, false, reason, message);
}
