using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Tests;

/// <summary>
/// The store discount limits, measured as pure arithmetic. These sentences are what an operator reads when a
/// coupon is refused, so the exact wording is asserted rather than just the fact that something came back.
/// </summary>
public sealed class DiscountPolicyGuardTests
{
    private static string? Refuse(
        DiscountPolicy policy,
        DiscountType type,
        decimal value,
        decimal? cap = null,
        decimal minOrderAmount = 0m) =>
        DiscountPolicyGuard.RefusalFor(policy, type, value, cap, minOrderAmount);

    // ---------------------------------------------------------------- the three limits

    [Fact]
    public void A_policy_that_sets_nothing_refuses_nothing()
    {
        Refuse(new DiscountPolicy(0, 0, 0, 0), DiscountType.Percentage, 90).Should().BeNull();
        Refuse(new DiscountPolicy(0, 0, 0, 0), DiscountType.FixedAmount, 5_000_000m).Should().BeNull();
    }

    [Fact]
    public void A_rate_above_the_maximum_is_named_with_both_numbers()
    {
        Refuse(new DiscountPolicy(30, 0, 0, 0), DiscountType.Percentage, 40)
            .Should().Be("Your policy allows at most 30% off. This coupon gives 40%.");

        Refuse(new DiscountPolicy(30, 0, 0, 0), DiscountType.Percentage, 30).Should().BeNull(
            "the limit itself is allowed; only going past it is not");
    }

    [Fact]
    public void The_rate_limit_leaves_a_fixed_amount_alone()
    {
        Refuse(new DiscountPolicy(30, 0, 0, 0), DiscountType.FixedAmount, 500m, minOrderAmount: 1_000m)
            .Should().BeNull("500 taka off is not a rate");
    }

    [Fact]
    public void An_uncapped_rate_is_refused_because_it_outgrows_the_ceiling()
    {
        Refuse(new DiscountPolicy(0, 2_000, 0, 0), DiscountType.Percentage, 10)
            .Should().Be("A 10% coupon passes your BDT 2,000 ceiling once an order reaches BDT 20,000. " +
                         "Set this coupon's maximum discount to BDT 2,000 or less.");
    }

    [Fact]
    public void A_rate_already_past_the_ceiling_at_its_own_minimum_is_told_so()
    {
        Refuse(new DiscountPolicy(0, 2_000, 0, 0), DiscountType.Percentage, 10, minOrderAmount: 50_000m)
            .Should().Be("At this coupon's own minimum order of BDT 50,000, 10% off is BDT 5,000. " +
                         "Your policy caps one discount at BDT 2,000.");
    }

    [Fact]
    public void A_maximum_discount_above_the_ceiling_is_the_part_that_has_to_change()
    {
        Refuse(new DiscountPolicy(0, 2_000, 0, 0), DiscountType.Percentage, 10, cap: 5_000m)
            .Should().Be("This coupon's maximum discount of BDT 5,000 is above your policy ceiling of BDT 2,000.");

        Refuse(new DiscountPolicy(0, 2_000, 0, 0), DiscountType.Percentage, 10, cap: 2_000m).Should().BeNull();
    }

    [Fact]
    public void A_fixed_amount_above_the_ceiling_is_refused_by_amount()
    {
        Refuse(new DiscountPolicy(0, 2_000, 0, 0), DiscountType.FixedAmount, 4_200m)
            .Should().Be("This coupon takes BDT 4,200 off one order. Your policy caps one discount at BDT 2,000.");

        // Held under the ceiling by its own maximum discount, the coupon is allowed.
        Refuse(new DiscountPolicy(0, 2_000, 0, 0), DiscountType.FixedAmount, 4_200m, cap: 1_500m).Should().BeNull();
    }

    [Fact]
    public void The_share_of_one_order_is_stated_as_the_order_it_would_eat()
    {
        Refuse(new DiscountPolicy(0, 0, 30, 0), DiscountType.FixedAmount, 4_200m, minOrderAmount: 6_000m)
            .Should().Be("This gives BDT 4,200 off a BDT 6,000 order — 70% of it. Your policy allows 30%.");

        Refuse(new DiscountPolicy(0, 0, 30, 0), DiscountType.FixedAmount, 1_200m, minOrderAmount: 6_000m)
            .Should().BeNull();
    }

    [Fact]
    public void A_fixed_amount_without_a_minimum_is_told_which_minimum_would_work()
    {
        Refuse(new DiscountPolicy(0, 0, 30, 0), DiscountType.FixedAmount, 500m)
            .Should().Be("BDT 500 off is more than 30% of any order under BDT 1,667. " +
                         "Give the coupon a minimum order of at least BDT 1,667, or lower the amount.");
    }

    [Fact]
    public void A_rate_can_also_be_judged_as_a_share_of_the_order()
    {
        Refuse(new DiscountPolicy(0, 0, 30, 0), DiscountType.Percentage, 40)
            .Should().Be("A 40% coupon takes 40% of the order it applies to. Your policy allows 30%.");
    }

    [Fact]
    public void The_rate_limit_is_read_before_the_ceiling_and_the_ceiling_before_the_share()
    {
        var policy = new DiscountPolicy(30, 2_000, 30, 0);

        Refuse(policy, DiscountType.Percentage, 40)
            .Should().StartWith("Your policy allows at most 30% off.");

        Refuse(policy, DiscountType.FixedAmount, 4_200m, minOrderAmount: 6_000m)
            .Should().StartWith("This coupon takes BDT 4,200 off one order.");
    }

    [Fact]
    public void Odd_rates_keep_their_decimal_places_in_the_sentence()
    {
        Refuse(new DiscountPolicy(12, 0, 0, 0), DiscountType.Percentage, 12.5m)
            .Should().Be("Your policy allows at most 12% off. This coupon gives 12.5%.");
    }

    // ---------------------------------------------------------------- the approval threshold

    [Fact]
    public void A_rate_past_the_approval_threshold_needs_a_second_signature()
    {
        var policy = new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25);

        DiscountPolicyGuard.NeedsApproval(policy, DiscountType.Percentage, 30).Should().BeTrue();
        DiscountPolicyGuard.NeedsApproval(policy, DiscountType.Percentage, 25).Should().BeFalse(
            "the threshold is the largest rate one administrator may grant alone");
        DiscountPolicyGuard.NeedsApproval(policy, DiscountType.FixedAmount, 9_999m).Should().BeFalse(
            "no amount threshold is set, so a fixed amount is judged on amount alone");
    }

    [Fact]
    public void An_amount_past_the_approval_threshold_needs_a_second_signature()
    {
        var policy = new DiscountPolicy(0, 0, 0, 0, ApprovalAboveAmount: 2_000);

        DiscountPolicyGuard.NeedsApproval(policy, DiscountType.FixedAmount, 2_001m).Should().BeTrue();
        DiscountPolicyGuard.NeedsApproval(policy, DiscountType.FixedAmount, 2_000m).Should().BeFalse();
        DiscountPolicyGuard.NeedsApproval(policy, DiscountType.FixedAmount, 5_000m, maxDiscountCap: 1_000m).Should().BeFalse(
            "its own maximum discount holds it under the threshold");

        DiscountPolicyGuard.NeedsApproval(policy, DiscountType.Percentage, 10, maxDiscountCap: 3_000m).Should().BeTrue(
            "a rate whose stated ceiling is past the threshold is a large discount");
        DiscountPolicyGuard.NeedsApproval(policy, DiscountType.Percentage, 10).Should().BeFalse(
            "an uncapped rate is judged on its percentage, because its taka value depends on the order");
    }

    [Fact]
    public void No_threshold_means_nothing_ever_waits_for_approval()
    {
        DiscountPolicyGuard.NeedsApproval(new DiscountPolicy(0, 0, 0, 0), DiscountType.FixedAmount, 999_999m)
            .Should().BeFalse();
    }
}
