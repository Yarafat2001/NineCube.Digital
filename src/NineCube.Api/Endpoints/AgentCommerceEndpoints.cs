using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;

namespace NineCube.Api.Endpoints;

/// <summary>
/// Autonomous Commerce API: Authoritative policy evaluation gate, secure execution orchestrator,
/// and policy catalog.
/// Implements NineCube Autonomous Commerce Architecture v3.1.
/// </summary>
public sealed class AgentCommerceEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/agent").WithTags("AgentCommerce");

        // 1. Authoritative Policy Gate: Server independently classifies risk and issues approval bindings
        group.MapPost("/evaluate-plan", async (
            EvaluatePlanRequest request,
            ICurrentUser user,
            IRiskClassificationService riskClassifier,
            ICommercePolicyEngine policyEngine,
            ISecureAuthorizationService authService,
            CancellationToken ct) =>
        {
            var serverAssignedRiskTier = riskClassifier.Classify(request.Intent);
            var policyDecision = await policyEngine.EvaluateAsync(user, request, serverAssignedRiskTier, ct);

            if (policyDecision.IsDenied)
            {
                return Results.Ok(new PlanEvaluationResponse(
                    Decision: "deny",
                    ServerAssignedRiskTier: serverAssignedRiskTier,
                    PolicyVersion: "v3.1-2026.11",
                    ReasonCode: policyDecision.ReasonCode,
                    ApprovalBinding: null));
            }

            if (serverAssignedRiskTier == 3)
            {
                var binding = await authService.CreateBindingAsync(user, request, null, ct);
                return Results.Ok(new PlanEvaluationResponse(
                    Decision: "require_user_approval",
                    ServerAssignedRiskTier: serverAssignedRiskTier,
                    PolicyVersion: "v3.1-2026.11",
                    ReasonCode: policyDecision.ReasonCode,
                    ApprovalBinding: binding));
            }

            return Results.Ok(new PlanEvaluationResponse(
                Decision: "allow",
                ServerAssignedRiskTier: serverAssignedRiskTier,
                PolicyVersion: "v3.1-2026.11",
                ReasonCode: policyDecision.ReasonCode,
                ApprovalBinding: null));
        }).RequireAuthorization(Policies.CustomerOnly);

        // 2. Authoritative Execution: Executes mutations through the Transaction Orchestrator
        group.MapPost("/execute-transaction", async (
            ExecuteTransactionRequest request,
            ICurrentUser user,
            ITransactionOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            var result = await orchestrator.ExecuteAsync(user, request, ct);

            return result.Succeeded
                ? Results.Ok(result)
                : Results.BadRequest(result);
        }).RequireAuthorization(Policies.CustomerOnly);

        // 3. Static Policy Catalog: Grounded introspection of risk tiers and freshness boundaries
        group.MapGet("/policy-catalog", () =>
        {
            return Results.Ok(new
            {
                version = "v3.1-2026.11",
                framework = "NineCube Autonomous Commerce - Dual-Plane Architecture",
                tiers = new object[]
                {
                    new
                    {
                        tier = 1,
                        name = "Tier 1: Read-Only",
                        autonomy = "100%",
                        description = "Factual catalog search, specification comparison, and order tracking queries.",
                        freshnessWindowSeconds = new { price = 60, stock = 30 }
                    },
                    new
                    {
                        tier = 2,
                        name = "Tier 2: Reversible Mutation",
                        autonomy = "Autonomous under Idempotency & Reconciliation",
                        description = "Cart line additions, updates, removals, and coupon codes.",
                        compensation = "Exact transaction delta rollback without affecting concurrent user additions."
                    },
                    new
                    {
                        tier = 3,
                        name = "Tier 3: High-Impact / Sensitive",
                        autonomy = "0% (Strict Human Approval Required)",
                        description = "Payment authorization, final checkout commit, address deletion, security modifications.",
                        protocol = "Acoustic awareness earcon + spoken notice + persistent visual security modal + cryptographic nonce."
                    }
                }
            });
        });
    }
}
