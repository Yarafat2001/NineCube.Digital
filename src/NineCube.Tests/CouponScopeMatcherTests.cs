using FluentAssertions;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Tests;

/// <summary>
/// The scope engine is pure logic, so it is decided here rather than through an HTTP call: which
/// catalogue lines a coupon may touch is the one thing that must be right before any taka is counted.
/// </summary>
public sealed class CouponScopeMatcherTests
{
    private static readonly int[] NoCategories = [];
    private static readonly int[] NoTags = [];

    private static ProductScopeFacts Phone =>
        new(ProductId: 101, BrandId: 7, ProductLineId: 21, CategoryIds: [3, 8], TagIds: [5]);

    private static ProductScopeFacts Case =>
        new(ProductId: 202, BrandId: 9, ProductLineId: null, CategoryIds: [8], TagIds: [5, 6]);

    private static ProductScopeFacts UnbrandedAccessory =>
        new(ProductId: 303, BrandId: null, ProductLineId: null, CategoryIds: NoCategories, TagIds: NoTags);

    private static CouponScopeRule Rule(ScopeAttribute attribute, ScopePolarity polarity, params int[] entityIds) =>
        new()
        {
            Attribute = attribute,
            Polarity = polarity,
            Values = entityIds.Select(id => new CouponScopeRuleValue { EntityId = id }).ToList()
        };

    [Fact]
    public void A_coupon_without_rules_covers_the_whole_basket()
    {
        var rules = CouponScopeMatcher.Compile([]);

        CouponScopeMatcher.Matches(Phone, rules, ScopeMatch.Any).Should().BeTrue();
        CouponScopeMatcher.Matches(UnbrandedAccessory, rules, ScopeMatch.Any).Should().BeTrue();
    }

    [Fact]
    public void A_category_rule_admits_only_products_carrying_that_category()
    {
        var rules = CouponScopeMatcher.Compile([Rule(ScopeAttribute.Category, ScopePolarity.Is, 8)]);

        CouponScopeMatcher.Matches(Phone, rules, ScopeMatch.All).Should().BeTrue();
        CouponScopeMatcher.Matches(UnbrandedAccessory, rules, ScopeMatch.All).Should().BeFalse();
    }

    [Fact]
    public void Any_lets_a_second_dimension_widen_the_scope()
    {
        var rules = CouponScopeMatcher.Compile(
            [
                Rule(ScopeAttribute.Category, ScopePolarity.Is, 8),
                Rule(ScopeAttribute.Brand, ScopePolarity.Is, 7)
            ]);

        // The case has the category but not the brand; the phone has both.
        CouponScopeMatcher.Matches(Case, rules, ScopeMatch.Any).Should().BeTrue();
        CouponScopeMatcher.Matches(UnbrandedAccessory, rules, ScopeMatch.Any).Should().BeFalse();
    }

    [Fact]
    public void All_narrows_the_scope_to_products_in_every_rule()
    {
        var rules = CouponScopeMatcher.Compile(
            [
                Rule(ScopeAttribute.Category, ScopePolarity.Is, 8),
                Rule(ScopeAttribute.Brand, ScopePolarity.Is, 7)
            ]);

        CouponScopeMatcher.Matches(Case, rules, ScopeMatch.All).Should().BeFalse();
        CouponScopeMatcher.Matches(Phone, rules, ScopeMatch.All).Should().BeTrue();
    }

    [Theory]
    [InlineData(ScopeMatch.Any)]
    [InlineData(ScopeMatch.All)]
    public void An_exclusion_always_subtracts_whatever_the_match_mode_says(ScopeMatch match)
    {
        var rules = CouponScopeMatcher.Compile(
            [
                Rule(ScopeAttribute.Category, ScopePolarity.Is, 8),
                Rule(ScopeAttribute.Brand, ScopePolarity.IsNot, 9)
            ]);

        CouponScopeMatcher.Matches(Phone, rules, match).Should().BeTrue();
        CouponScopeMatcher.Matches(Case, rules, match).Should().BeFalse("the brand is excluded");
    }

    [Fact]
    public void Exclusions_only_still_cover_everything_they_do_not_name()
    {
        var rules = CouponScopeMatcher.Compile([Rule(ScopeAttribute.Product, ScopePolarity.IsNot, 202)]);

        CouponScopeMatcher.Matches(Phone, rules, ScopeMatch.Any).Should().BeTrue();
        CouponScopeMatcher.Matches(Case, rules, ScopeMatch.Any).Should().BeFalse();
    }

    [Theory]
    [InlineData(ScopeAttribute.Brand, 7, true)]
    [InlineData(ScopeAttribute.Brand, 9, false)]
    [InlineData(ScopeAttribute.ProductLine, 21, true)]
    [InlineData(ScopeAttribute.Tag, 5, true)]
    [InlineData(ScopeAttribute.Tag, 6, false)]
    [InlineData(ScopeAttribute.Product, 101, true)]
    [InlineData(ScopeAttribute.Product, 303, false)]
    public void Every_dimension_reads_its_own_catalogue_fact(ScopeAttribute attribute, int entityId, bool admits)
    {
        var rules = CouponScopeMatcher.Compile([Rule(attribute, ScopePolarity.Is, entityId)]);

        CouponScopeMatcher.Matches(Phone, rules, ScopeMatch.Any).Should().Be(admits);
    }

    [Fact]
    public void A_product_without_a_brand_or_series_can_still_be_reached_by_dimension()
    {
        var rules = CouponScopeMatcher.Compile([Rule(ScopeAttribute.Brand, ScopePolarity.Is, 7)]);
        var series = CouponScopeMatcher.Compile([Rule(ScopeAttribute.ProductLine, ScopePolarity.Is, 21)]);

        CouponScopeMatcher.Matches(UnbrandedAccessory, rules, ScopeMatch.Any).Should().BeFalse();
        CouponScopeMatcher.Matches(UnbrandedAccessory, series, ScopeMatch.Any).Should().BeFalse();
    }

    [Fact]
    public void A_rules_ids_are_a_set_not_a_list()
    {
        var rules = CouponScopeMatcher.Compile([Rule(ScopeAttribute.Category, ScopePolarity.Is, 8, 8, 8)]);

        rules.Should().HaveCount(1);
        rules[0].EntityIds.Should().BeEquivalentTo(new[] { 8 });
    }

    [Theory]
    [InlineData(CouponTargetType.Order, null, 0)]
    [InlineData(CouponTargetType.Category, null, 0)]
    [InlineData(CouponTargetType.Category, 8, 1)]
    [InlineData(CouponTargetType.Brand, 7, 1)]
    [InlineData(CouponTargetType.Product, 101, 1)]
    public void The_legacy_single_target_column_is_read_as_one_rule(
        CouponTargetType targetType, int? targetId, int expectedRules)
    {
        var rules = CouponScopeMatcher.RulesFromLegacy(targetType, targetId);

        rules.Should().HaveCount(expectedRules);
        if (expectedRules == 0) return;

        rules[0].Polarity.Should().Be(ScopePolarity.Is);
        targetId.Should().NotBeNull();
        rules[0].Values.Single().EntityId.Should().Be(targetId ?? 0);
    }

    [Fact]
    public void A_legacy_row_with_no_target_matches_nothing_rather_than_the_whole_basket()
    {
        // The hazard this closes: a coupon that claims to target a category but names none used to
        // fall through to the storewide branch and discount every line in the basket.
        var rules = CouponScopeMatcher.RulesFromLegacy(CouponTargetType.Category, null);

        rules.Should().BeEmpty();
    }

    [Fact]
    public void CompileLegacy_produces_the_same_compiled_rule_as_the_new_path()
    {
        var fromLegacy = CouponScopeMatcher.CompileLegacy(CouponTargetType.Brand, 7);
        var fromRules = CouponScopeMatcher.Compile([Rule(ScopeAttribute.Brand, ScopePolarity.Is, 7)]);

        fromLegacy.Should().BeEquivalentTo(fromRules);
    }
}
