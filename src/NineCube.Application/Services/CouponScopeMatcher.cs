using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>The catalogue facts of one product that a scope rule can test.</summary>
public sealed record ProductScopeFacts(
    int ProductId,
    int? BrandId,
    int? ProductLineId,
    IReadOnlyCollection<int> CategoryIds,
    IReadOnlyCollection<int> TagIds);

/// <summary>A scope rule with its ids loaded into a set, ready for line-by-line matching.</summary>
public sealed record CompiledScopeRule(ScopeAttribute Attribute, ScopePolarity Polarity, IReadOnlySet<int> EntityIds);

/// <summary>
/// Decides which basket lines a coupon may discount. Rules marked IsNot always subtract, so
/// "Footwear and Electronics, except Clearance" reads naturally under either match mode; the
/// ScopeMatch only decides how the admitting rules combine.
/// </summary>
public static class CouponScopeMatcher
{
    public static IReadOnlyList<CompiledScopeRule> Compile(IEnumerable<CouponScopeRule> rules) =>
        rules.Select(r => new CompiledScopeRule(r.Attribute, r.Polarity, r.Values.Select(v => v.EntityId).ToHashSet()))
            .ToList();

    /// <summary>Reads the pre-rule scope column as the single rule it always meant.</summary>
    public static List<CouponScopeRule> RulesFromLegacy(CouponTargetType targetType, int? targetId)
    {
        if (targetType == CouponTargetType.Order || !targetId.HasValue) return [];

        var attribute = targetType switch
        {
            CouponTargetType.Category => ScopeAttribute.Category,
            CouponTargetType.Brand => ScopeAttribute.Brand,
            _ => ScopeAttribute.Product
        };

        return
        [
            new CouponScopeRule
            {
                Attribute = attribute,
                Polarity = ScopePolarity.Is,
                Values = [new CouponScopeRuleValue { EntityId = targetId.Value }]
            }
        ];
    }

    /// <summary>Reads the pre-rule scope column so coupons created before scope rules still behave.</summary>
    public static IReadOnlyList<CompiledScopeRule> CompileLegacy(CouponTargetType targetType, int? targetId) =>
        Compile(RulesFromLegacy(targetType, targetId));

    public static bool Matches(ProductScopeFacts facts, IReadOnlyList<CompiledScopeRule> rules, ScopeMatch match)
    {
        if (rules.Count == 0) return true;

        var admits = rules.Where(r => r.Polarity == ScopePolarity.Is).ToList();

        // An excluded line is out no matter how the rest combine.
        if (rules.Any(r => r.Polarity == ScopePolarity.IsNot && MatchesRule(facts, r))) return false;

        if (admits.Count == 0) return true;

        return match == ScopeMatch.All
            ? admits.All(r => MatchesRule(facts, r))
            : admits.Any(r => MatchesRule(facts, r));
    }

    private static bool MatchesRule(ProductScopeFacts facts, CompiledScopeRule rule) => rule.Attribute switch
    {
        ScopeAttribute.Category => facts.CategoryIds.Any(id => rule.EntityIds.Contains(id)),
        ScopeAttribute.Brand => facts.BrandId.HasValue && rule.EntityIds.Contains(facts.BrandId.Value),
        ScopeAttribute.ProductLine => facts.ProductLineId.HasValue && rule.EntityIds.Contains(facts.ProductLineId.Value),
        ScopeAttribute.Tag => facts.TagIds.Any(id => rule.EntityIds.Contains(id)),
        ScopeAttribute.Product => rule.EntityIds.Contains(facts.ProductId),
        _ => false
    };
}
