using System.Globalization;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>
/// The arithmetic of a store's own discount limits. Each refusal names the number that broke the rule and
/// the change that would satisfy it, because a guardrail an operator cannot satisfy is just a wall.
/// </summary>
public static class DiscountPolicyGuard
{
    /// <summary>The sentence that refuses this coupon, or null when the policy allows it.</summary>
    public static string? RefusalFor(
        DiscountPolicy policy,
        DiscountType type,
        decimal discountValue,
        decimal? maxDiscountCap,
        decimal minOrderAmount)
    {
        var refusal = RefuseRate(policy, type, discountValue);
        if (refusal is not null) return refusal;

        refusal = RefuseAmountPerOrder(policy, type, discountValue, maxDiscountCap, minOrderAmount);
        if (refusal is not null) return refusal;

        return RefuseShareOfOrder(policy, type, discountValue, maxDiscountCap, minOrderAmount);
    }

    /// <summary>The most this coupon can ever take off a single order, its own cap included.</summary>
    public static decimal WorstPerOrder(DiscountType type, decimal discountValue, decimal? maxDiscountCap) =>
        type switch
        {
            DiscountType.FixedAmount => Math.Min(discountValue, maxDiscountCap ?? discountValue),
            _ => maxDiscountCap ?? decimal.MaxValue
        };

    /// <summary>
    /// True when the discount is large enough that the store wants a second signature before it goes live.
    /// An uncapped percentage is judged on its rate alone, since its taka value depends on the order.
    /// </summary>
    public static bool NeedsApproval(DiscountPolicy policy, DiscountType type, decimal discountValue, decimal? maxDiscountCap = null)
    {
        if (type == DiscountType.Percentage)
        {
            if (policy.ApprovalAbovePercentage > 0 && discountValue > policy.ApprovalAbovePercentage) return true;
            return policy.ApprovalAboveAmount > 0 && maxDiscountCap > policy.ApprovalAboveAmount;
        }

        return policy.ApprovalAboveAmount > 0 &&
               WorstPerOrder(type, discountValue, maxDiscountCap) > policy.ApprovalAboveAmount;
    }

    private static string? RefuseRate(DiscountPolicy policy, DiscountType type, decimal discountValue)
    {
        if (policy.MaxPercentageOff <= 0 || type != DiscountType.Percentage) return null;
        if (discountValue <= policy.MaxPercentageOff) return null;

        return $"Your policy allows at most {Pct(policy.MaxPercentageOff)} off. This coupon gives {Pct(discountValue)}.";
    }

    private static string? RefuseAmountPerOrder(
        DiscountPolicy policy, DiscountType type, decimal discountValue, decimal? maxDiscountCap, decimal minOrderAmount)
    {
        if (policy.MaxAmountPerOrder <= 0) return null;
        var ceiling = policy.MaxAmountPerOrder;

        if (type == DiscountType.Percentage)
        {
            if (discountValue <= 0) return null;

            // Without a maximum discount of its own, a rate keeps growing with the order, so the question is
            // which order first pushes it past the ceiling.
            if (!maxDiscountCap.HasValue)
            {
                var breachingOrder = RoundUp(ceiling / (discountValue / 100m));
                if (minOrderAmount >= breachingOrder)
                {
                    return $"At this coupon's own minimum order of {Taka(minOrderAmount)}, {Pct(discountValue)} off is " +
                           $"{Taka(discountValue * minOrderAmount / 100m)}. Your policy caps one discount at {Taka(ceiling)}.";
                }

                return $"A {Pct(discountValue)} coupon passes your {Taka(ceiling)} ceiling once an order reaches " +
                       $"{Taka(breachingOrder)}. Set this coupon's maximum discount to {Taka(ceiling)} or less.";
            }
        }

        var worst = WorstPerOrder(type, discountValue, maxDiscountCap);
        if (worst <= ceiling) return null;

        return type == DiscountType.Percentage
            ? $"This coupon's maximum discount of {Taka(maxDiscountCap!.Value)} is above your policy ceiling of {Taka(ceiling)}."
            : $"This coupon takes {Taka(worst)} off one order. Your policy caps one discount at {Taka(ceiling)}.";
    }

    private static string? RefuseShareOfOrder(
        DiscountPolicy policy, DiscountType type, decimal discountValue, decimal? maxDiscountCap, decimal minOrderAmount)
    {
        if (policy.MaxShareOfOrder <= 0) return null;
        var share = policy.MaxShareOfOrder;

        if (type == DiscountType.Percentage)
        {
            return discountValue > share
                ? $"A {Pct(discountValue)} coupon takes {Pct(discountValue)} of the order it applies to. Your policy allows {Pct(share)}."
                : null;
        }

        var worst = WorstPerOrder(type, discountValue, maxDiscountCap);
        if (worst <= 0) return null;

        if (minOrderAmount > 0)
        {
            var taken = decimal.Round(worst / minOrderAmount * 100m, 1, MidpointRounding.AwayFromZero);
            return taken > share
                ? $"This gives {Taka(worst)} off a {Taka(minOrderAmount)} order — {Pct(taken)} of it. Your policy allows {Pct(share)}."
                : null;
        }

        // No minimum order means the ceiling of an order this amount can dominate is the smallest order on the shop.
        var floor = RoundUp(worst / (share / 100m));
        return $"{Taka(worst)} off is more than {Pct(share)} of any order under {Taka(floor)}. " +
               $"Give the coupon a minimum order of at least {Taka(floor)}, or lower the amount.";
    }

    private static decimal RoundUp(decimal value) =>
        decimal.Round(value, 0, MidpointRounding.AwayFromZero);

    public static string Taka(decimal amount) => $"BDT {amount.ToString("N0", CultureInfo.InvariantCulture)}";

    public static string Pct(decimal percent) => $"{percent.ToString("0.#", CultureInfo.InvariantCulture)}%";
}
