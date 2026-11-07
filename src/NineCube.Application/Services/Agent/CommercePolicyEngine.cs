using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;

namespace NineCube.Application.Services.Agent;

/// <summary>
/// Authoritative policy engine executing deterministic business guardrails and access rules.
/// </summary>
public sealed class CommercePolicyEngine(IAppDbContext db) : ICommercePolicyEngine
{
    private const int MaxAgentQuantityPerMutation = 20;

    public async Task<PolicyDecision> EvaluateAsync(
        ICurrentUser user,
        EvaluatePlanRequest request,
        int serverAssignedRiskTier,
        CancellationToken ct = default)
    {
        // 1. Authentication guardrails for mutations
        if (serverAssignedRiskTier >= 2 && !user.IsAuthenticated)
        {
            return PolicyDecision.Deny(
                "UNAUTHENTICATED_MUTATION",
                "Storefront mutations require an authenticated customer session.");
        }

        // 2. Customer ID resolution
        if (serverAssignedRiskTier >= 2 && (!user.CustomerId.HasValue || user.CustomerId.Value <= 0))
        {
            return PolicyDecision.Deny(
                "MISSING_CUSTOMER_PROFILE",
                "User account is not linked to an active customer profile.");
        }

        // 3. High-impact Tier 3 operations ALWAYS require explicit human authorization
        if (serverAssignedRiskTier == 3)
        {
            return PolicyDecision.RequireApproval(
                "TIER_3_HUMAN_IN_THE_LOOP",
                "High-impact operation requires verified cryptographic nonce and explicit customer confirmation.");
        }

        // 4. Tier 2 Mutation parameter sanity checks
        if (serverAssignedRiskTier == 2)
        {
            if (request.Quantity.HasValue && (request.Quantity.Value <= 0 || request.Quantity.Value > MaxAgentQuantityPerMutation))
            {
                return PolicyDecision.Deny(
                    "QUANTITY_OUT_OF_BOUNDS",
                    $"Autonomous cart mutations are restricted to quantities between 1 and {MaxAgentQuantityPerMutation}.");
            }

            if (request.TargetProductId.HasValue)
            {
                var product = await db.Products.AsNoTracking()
                    .FirstOrDefaultAsync(p => p.Id == request.TargetProductId.Value, ct);

                if (product is null)
                {
                    return PolicyDecision.Deny(
                        "PRODUCT_NOT_FOUND",
                        $"Product ID {request.TargetProductId.Value} does not exist in the catalog.");
                }

                if (!product.IsActive)
                {
                    return PolicyDecision.Deny(
                        "PRODUCT_INACTIVE",
                        $"Product '{product.Name}' is no longer active in the store.");
                }

                if (product.StockQuantity <= 0)
                {
                    return PolicyDecision.Deny(
                        "OUT_OF_STOCK",
                        $"Product '{product.Name}' is currently out of stock.");
                }
            }
        }

        // 5. Tier 1 read-only operations pass through
        return PolicyDecision.Allow();
    }
}
