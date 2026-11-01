using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface ICouponService
{
    Task<CouponValidationResult> ValidateCouponAsync(ApplyCouponRequest request, CancellationToken ct = default);
    Task<CartPromotionsEvaluationResult> EvaluateCartPromotionsAsync(EvaluateCartPromotionsRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<CouponDto>> ListCouponsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<CouponDto>> GetActiveCampaignBannersAsync(CancellationToken ct = default);
    Task<IReadOnlyList<CouponDto>> GetAvailableCouponsAsync(CancellationToken ct = default);
    Task<CouponDto> CreateCouponAsync(CreateCouponRequest request, CancellationToken ct = default);
    Task<bool> ToggleCouponStatusAsync(int id, bool isActive, CancellationToken ct = default);
    Task ConsumeCouponAsync(string code, CancellationToken ct = default);
    Task<CouponDto> UpdateCouponAsync(int id, UpdateCouponRequest request, CancellationToken ct = default);
    Task<bool> DeleteCouponAsync(int id, CancellationToken ct = default);
    Task<CouponScopePreviewResult> PreviewScopeAsync(CouponScopePreviewRequest request, CancellationToken ct = default);
}

public sealed class CouponService : ICouponService
{
    private readonly IAppDbContext _db;
    private readonly IClock _clock;

    /// <summary>Catalogue names are looked up once per request and reused across rules and coupons.</summary>
    private readonly Dictionary<string, string> _nameCache = new();

    public CouponService(IAppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    /// <summary>An evaluated coupon plus the basket products it actually discounted.</summary>
    private sealed record Evaluation(Coupon? Coupon, CouponValidationResult Result, IReadOnlyList<int> ProductIds);

    // ------------------------------------------------------------------ evaluation

    public async Task<CouponValidationResult> ValidateCouponAsync(ApplyCouponRequest request, CancellationToken ct = default)
    {
        var code = request.Code.Trim().ToUpperInvariant();
        var coupon = await QueryCoupons().FirstOrDefaultAsync(c => c.Code == code, ct);

        if (coupon is null || !coupon.IsActive)
        {
            return Invalid("Coupon code is invalid or no longer active.");
        }

        return (await EvaluateAsync(coupon, request.SubTotal, request.Items, _clock.UtcNow, null, ct)).Result;
    }

    public async Task<CartPromotionsEvaluationResult> EvaluateCartPromotionsAsync(EvaluateCartPromotionsRequest request, CancellationToken ct = default)
    {
        const decimal freeShippingThreshold = 2500m;
        var qualifiesForFreeShipping = request.SubTotal >= freeShippingThreshold;
        var amountNeeded = qualifiesForFreeShipping ? 0m : Math.Max(0m, freeShippingThreshold - request.SubTotal);

        var now = _clock.UtcNow;

        // 1. Automatic promotions, largest first.
        var autoCandidates = new List<Evaluation>();
        var autoCoupons = await QueryCoupons()
            .Where(c => c.IsActive && c.IsAutomatic)
            .Where(c => !c.StartsAt.HasValue || c.StartsAt.Value <= now)
            .Where(c => !c.ExpiresAt.HasValue || c.ExpiresAt.Value >= now)
            .Where(c => !c.UsageLimit.HasValue || c.UsageCount < c.UsageLimit.Value)
            .ToListAsync(ct);

        foreach (var coupon in autoCoupons)
        {
            var evaluation = await EvaluateAsync(coupon, request.SubTotal, request.Items, now, null, ct);
            if (evaluation.Result.IsValid) autoCandidates.Add(evaluation);
        }
        autoCandidates = autoCandidates.OrderByDescending(e => e.Result.DiscountAmount).ToList();

        // 2. The code the shopper typed.
        Evaluation? manual = null;
        if (!string.IsNullOrWhiteSpace(request.ManualCouponCode))
        {
            var coded = await QueryCoupons()
                .FirstOrDefaultAsync(c => c.Code == request.ManualCouponCode.Trim().ToUpperInvariant(), ct);

            manual = coded is null
                ? new Evaluation(null, Invalid("Coupon code is invalid or no longer active."), Array.Empty<int>())
                : await EvaluateAsync(coded, request.SubTotal, request.Items, now, null, ct);
        }

        var manualDiscount = manual?.Result;

        // 3. Resolve what actually applies. BestOnly keeps the historical one-discount-per-order behaviour;
        //    a coupon only adds a second discount when its own exclusivity says StackByScope, and even then
        //    it may not re-discount a line a chosen coupon already covered.
        var applied = new List<Evaluation>();
        var claimed = new HashSet<int>();

        if (manual is not null && manual.Result.IsValid)
        {
            applied.Add(manual);
            foreach (var id in manual.ProductIds) claimed.Add(id);

            if (manual.Result.Exclusivity != DiscountExclusivity.Exclusive)
            {
                foreach (var candidate in autoCandidates.Where(e => e.Result.Exclusivity == DiscountExclusivity.StackByScope))
                {
                    var extra = await EvaluateAsync(candidate.Coupon!, request.SubTotal, request.Items, now, claimed, ct);
                    if (extra.Result.IsValid && extra.Result.DiscountAmount > 0)
                    {
                        applied.Add(extra);
                        foreach (var id in extra.ProductIds) claimed.Add(id);
                    }
                }
            }
        }
        else if (autoCandidates.Count > 0)
        {
            applied.Add(autoCandidates[0]);
            foreach (var id in autoCandidates[0].ProductIds) claimed.Add(id);

            if (autoCandidates[0].Result.Exclusivity != DiscountExclusivity.Exclusive)
            {
                foreach (var candidate in autoCandidates.Skip(1).Where(e => e.Result.Exclusivity == DiscountExclusivity.StackByScope))
                {
                    var extra = await EvaluateAsync(candidate.Coupon!, request.SubTotal, request.Items, now, claimed, ct);
                    if (extra.Result.IsValid && extra.Result.DiscountAmount > 0)
                    {
                        applied.Add(extra);
                        foreach (var id in extra.ProductIds) claimed.Add(id);
                    }
                }
            }
        }

        var totalDiscount = Math.Min(
            applied.Sum(e => e.Result.DiscountAmount),
            request.SubTotal);

        var effective = applied.Count switch
        {
            0 => null,
            1 => applied[0].Result,
            _ => Combine(applied, totalDiscount)
        };

        var headline = autoCandidates.FirstOrDefault()?.Result.CampaignTitle
            ?? (await GetActiveCampaignBannersAsync(ct)).FirstOrDefault()?.CampaignTitle;

        return new CartPromotionsEvaluationResult(
            autoCandidates.FirstOrDefault()?.Result,
            manualDiscount,
            effective,
            totalDiscount,
            headline,
            freeShippingThreshold,
            qualifiesForFreeShipping,
            amountNeeded,
            applied.Select(e => e.Result).ToList());
    }

    private IQueryable<Coupon> QueryCoupons() =>
        _db.Coupons.AsNoTracking()
            .Include(c => c.ScopeRules)
            .ThenInclude(r => r.Values);

    private async Task<Evaluation> EvaluateAsync(
        Coupon coupon,
        decimal subTotal,
        IReadOnlyList<CartLineItemDto>? items,
        DateTime now,
        IReadOnlyCollection<int>? ignoreProductIds,
        CancellationToken ct)
    {
        if (coupon.StartsAt.HasValue && coupon.StartsAt.Value > now)
        {
            return NoMatch("This promotional campaign has not started yet.", coupon);
        }

        if (coupon.ExpiresAt.HasValue && coupon.ExpiresAt.Value < now)
        {
            return NoMatch("Coupon has expired.", coupon);
        }

        if (coupon.UsageLimit.HasValue && coupon.UsageCount >= coupon.UsageLimit.Value)
        {
            return NoMatch("Coupon usage limit has been reached.", coupon);
        }

        if (subTotal < coupon.MinOrderAmount)
        {
            return NoMatch(
                $"Minimum order amount of {coupon.MinOrderAmount:0.00} required to apply this promotion.", coupon);
        }

        var rules = ResolveCompiledRules(coupon);
        var ignored = ignoreProductIds is null ? null : new HashSet<int>(ignoreProductIds);

        if (rules.Count == 0)
        {
            var storewide = DiscountFor(coupon, subTotal);
            return new Evaluation(
                coupon,
                Ok(coupon, storewide, subTotal, await DescribeScopeAsync(coupon, ct)),
                (items ?? Array.Empty<CartLineItemDto>())
                    .Where(i => ignored is null || !ignored.Contains(i.ProductId))
                    .Select(i => i.ProductId).Distinct().ToList());
        }

        if (items is null || items.Count == 0)
        {
            return NoMatch(
                "This promotion applies to selected products, so add one of them to the basket first.",
                coupon, 0m, await DescribeScopeAsync(coupon, ct));
        }

        var facts = await LoadFactsAsync(items.Select(i => i.ProductId).Distinct().ToList(), ct);
        var matched = items
            .Where(i => ignored is null || !ignored.Contains(i.ProductId))
            .Where(i => facts.TryGetValue(i.ProductId, out var fact) &&
                        CouponScopeMatcher.Matches(fact, rules, coupon.ScopeMatch))
            .ToList();

        var eligibleAmount = matched.Sum(i => i.Quantity * i.UnitPrice);
        var description = await DescribeScopeAsync(coupon, ct);

        if (eligibleAmount <= 0)
        {
            return NoMatch($"This promotion only applies to {description}.", coupon, 0m, description);
        }

        if (coupon.MinEligibleAmount > 0 && eligibleAmount < coupon.MinEligibleAmount)
        {
            return NoMatch(
                $"Spend at least {coupon.MinEligibleAmount:0.00} on {description} to use this promotion.",
                coupon, eligibleAmount, description);
        }

        return new Evaluation(
            coupon,
            Ok(coupon, DiscountFor(coupon, eligibleAmount), eligibleAmount, description),
            matched.Select(i => i.ProductId).Distinct().ToList());
    }

    /// <summary>The money arithmetic, shared by the basket path and the scope preview.</summary>
    private static decimal DiscountFor(Coupon coupon, decimal eligibleAmount)
        => DiscountFor(coupon.DiscountType, coupon.DiscountValue, coupon.MaxDiscountCap, eligibleAmount);

    internal static decimal DiscountFor(DiscountType type, decimal value, decimal? cap, decimal eligibleAmount)
    {
        decimal discount = type switch
        {
            DiscountType.Percentage => decimal.Round(eligibleAmount * (value / 100m), 2, MidpointRounding.AwayFromZero),
            DiscountType.FixedAmount => Math.Min(eligibleAmount, value),
            _ => 0
        };

        if (cap.HasValue && cap.Value > 0) discount = Math.Min(discount, cap.Value);
        return Math.Max(0, discount);
    }

    private static Evaluation NoMatch(string reason, Coupon coupon, decimal eligibleAmount = 0m, string? scopeSummary = null) =>
        new(coupon,
            new CouponValidationResult(false, reason, 0, coupon.Code, coupon.CampaignTitle,
                coupon.TargetType, coupon.MaxDiscountCap, eligibleAmount, scopeSummary, coupon.Exclusivity),
            Array.Empty<int>());

    private static CouponValidationResult Invalid(string reason) =>
        new(false, reason, 0, null);

    private static CouponValidationResult Ok(
        Coupon coupon, decimal discount, decimal eligibleAmount, string scope)
    {
        var capped = Math.Min(discount, eligibleAmount);
        return new CouponValidationResult(true, null, capped, coupon.Code, coupon.CampaignTitle,
            coupon.TargetType, coupon.MaxDiscountCap, eligibleAmount, scope, coupon.Exclusivity);
    }

    private static CouponValidationResult Combine(IReadOnlyList<Evaluation> applied, decimal totalDiscount)
    {
        var first = applied[0].Result;
        var codes = string.Join(" + ", applied.Select(a => a.Result.Code));
        var eligible = applied.Sum(a => a.Result.EligibleAmount);

        return new CouponValidationResult(
            true, null, totalDiscount, first.Code, first.CampaignTitle, first.TargetType, first.MaxDiscountCap,
            eligible, $"{codes} on {eligible:0.00} of qualifying items", first.Exclusivity);
    }

    // ------------------------------------------------------------------ scope rules

    /// <summary>Rules win when present; otherwise the pre-rule TargetType/TargetId pair is read as one rule.</summary>
    private static IReadOnlyList<CompiledScopeRule> ResolveCompiledRules(Coupon coupon) =>
        CouponScopeMatcher.Compile(EffectiveRules(coupon));

    /// <summary>The same rule set, kept as entities so the registry can print names for old rows too.</summary>
    private static IReadOnlyList<CouponScopeRule> EffectiveRules(Coupon coupon) =>
        coupon.ScopeRules.Count > 0
            ? coupon.ScopeRules
            : CouponScopeMatcher.RulesFromLegacy(coupon.TargetType, coupon.TargetId);

    private static CouponTargetType SummaryTargetType(IReadOnlyList<CouponScopeRule> rules)
    {
        var first = rules.FirstOrDefault(r => r.Polarity == ScopePolarity.Is);
        return first?.Attribute switch
        {
            ScopeAttribute.Category => CouponTargetType.Category,
            ScopeAttribute.Brand => CouponTargetType.Brand,
            ScopeAttribute.Product => CouponTargetType.Product,
            _ => CouponTargetType.Order
        };
    }

    private static int? SummaryTargetId(IReadOnlyList<CouponScopeRule> rules)
    {
        var first = rules.FirstOrDefault(r => r.Polarity == ScopePolarity.Is);
        if (first is null) return null;
        return first.Attribute switch
        {
            ScopeAttribute.Category or ScopeAttribute.Brand or ScopeAttribute.Product => first.Values.MinBy(v => v.EntityId)?.EntityId,
            _ => null
        };
    }

    /// <summary>
    /// Turns whatever the client sent into stored rules, refusing a scope that names nothing or points at a
    /// catalogue id that does not exist — that is how a "Footwear" coupon used to end up discounting the basket.
    /// </summary>
    private async Task<List<CouponScopeRule>> NormalizeRulesAsync(
        IReadOnlyList<CouponScopeRuleDto>? requested,
        CouponTargetType targetType,
        int? targetId,
        CancellationToken ct)
    {
        var rules = requested is null
            ? LegacyRules(targetType, targetId)
            : requested.Select(r => new CouponScopeRule
            {
                Attribute = r.Attribute,
                Polarity = r.Polarity,
                Values = r.EntityIds.Distinct().Select(id => new CouponScopeRuleValue { EntityId = id }).ToList()
            }).ToList();

        foreach (var rule in rules)
        {
            if (rule.Values.Count == 0)
            {
                throw new BusinessValidationException(
                    $"The {Describe(rule.Attribute)} condition has no selection. Pick at least one {Describe(rule.Attribute).ToLowerInvariant}, or remove that condition.");
            }
        }

        await ValidateEntityIdsExistAsync(rules, ct);
        return rules;
    }

    private static List<CouponScopeRule> LegacyRules(CouponTargetType targetType, int? targetId)
    {
        if (targetType == CouponTargetType.Order) return [];

        if (!targetId.HasValue)
        {
            throw new BusinessValidationException(
                "Choose the specific category, brand, series, tag or product this discount applies to, or set it to apply to the whole order.");
        }

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

    private async Task ValidateEntityIdsExistAsync(IReadOnlyList<CouponScopeRule> rules, CancellationToken ct)
    {
        foreach (var group in rules.GroupBy(r => r.Attribute))
        {
            var ids = group.SelectMany(r => r.Values).Select(v => v.EntityId).Distinct().ToList();
            if (ids.Count == 0) continue;

            var known = group.Key switch
            {
                ScopeAttribute.Category => await _db.Categories.AsNoTracking()
                    .Where(x => ids.Contains(x.Id)).Select(x => x.Id).ToListAsync(ct),
                ScopeAttribute.Brand => await _db.Brands.AsNoTracking()
                    .Where(x => ids.Contains(x.Id)).Select(x => x.Id).ToListAsync(ct),
                ScopeAttribute.ProductLine => await _db.ProductLines.AsNoTracking()
                    .Where(x => ids.Contains(x.Id)).Select(x => x.Id).ToListAsync(ct),
                ScopeAttribute.Tag => await _db.Tags.AsNoTracking()
                    .Where(x => ids.Contains(x.Id)).Select(x => x.Id).ToListAsync(ct),
                ScopeAttribute.Product => await _db.Products.AsNoTracking()
                    .Where(x => ids.Contains(x.Id)).Select(x => x.Id).ToListAsync(ct),
                _ => []
            };

            var missing = ids.Except(known).ToList();
            if (missing.Count > 0)
            {
                throw new BusinessValidationException(
                    $"Unknown {Describe(group.Key).ToLowerInvariant()} id(s): {string.Join(", ", missing)}.");
            }
        }
    }

    private static string Describe(ScopeAttribute attribute) => attribute switch
    {
        ScopeAttribute.Category => "Category",
        ScopeAttribute.Brand => "Brand",
        ScopeAttribute.ProductLine => "Series",
        ScopeAttribute.Tag => "Tag",
        ScopeAttribute.Product => "Product",
        _ => attribute.ToString()
    };

    private async Task<Dictionary<int, ProductScopeFacts>> LoadFactsAsync(IReadOnlyList<int> productIds, CancellationToken ct)
    {
        if (productIds.Count == 0) return [];

        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .Select(p => new { p.Id, p.BrandId, p.ProductLineId })
            .ToListAsync(ct);

        var categories = await _db.ProductCategories.AsNoTracking()
            .Where(pc => productIds.Contains(pc.ProductId))
            .Select(pc => new { pc.ProductId, pc.CategoryId })
            .ToListAsync(ct);

        var tags = await _db.ProductTags.AsNoTracking()
            .Where(pt => productIds.Contains(pt.ProductId))
            .Select(pt => new { pt.ProductId, pt.TagId })
            .ToListAsync(ct);

        return products.ToDictionary(
            p => p.Id,
            p => new ProductScopeFacts(
                p.Id, p.BrandId, p.ProductLineId,
                categories.Where(c => c.ProductId == p.Id).Select(c => c.CategoryId).ToList(),
                tags.Where(t => t.ProductId == p.Id).Select(t => t.TagId).ToList()));
    }

    private async Task<Dictionary<ScopeAttribute, Dictionary<int, string>>> LoadNamesAsync(
        IReadOnlyCollection<(ScopeAttribute Attribute, int Id)> pairs, CancellationToken ct)
    {
        var result = new Dictionary<ScopeAttribute, Dictionary<int, string>>();
        foreach (var group in pairs.GroupBy(p => p.Attribute))
        {
            var wanted = group.Select(p => p.Id).Distinct()
                .Where(id => !_nameCache.ContainsKey($"{group.Key}:{id}"))
                .ToList();
            if (wanted.Count == 0) continue;

            var found = group.Key switch
            {
                ScopeAttribute.Category => (await _db.Categories.AsNoTracking()
                    .Where(x => wanted.Contains(x.Id)).Select(x => new { x.Id, x.Name }).ToListAsync(ct))
                    .ToDictionary(x => x.Id, x => x.Name),
                ScopeAttribute.Brand => (await _db.Brands.AsNoTracking()
                    .Where(x => wanted.Contains(x.Id)).Select(x => new { x.Id, x.Name }).ToListAsync(ct))
                    .ToDictionary(x => x.Id, x => x.Name),
                ScopeAttribute.ProductLine => (await _db.ProductLines.AsNoTracking()
                    .Where(x => wanted.Contains(x.Id)).Select(x => new { x.Id, x.Name }).ToListAsync(ct))
                    .ToDictionary(x => x.Id, x => x.Name),
                ScopeAttribute.Tag => (await _db.Tags.AsNoTracking()
                    .Where(x => wanted.Contains(x.Id)).Select(x => new { x.Id, x.Name }).ToListAsync(ct))
                    .ToDictionary(x => x.Id, x => x.Name),
                ScopeAttribute.Product => (await _db.Products.AsNoTracking()
                    .Where(x => wanted.Contains(x.Id)).Select(x => new { x.Id, x.Name }).ToListAsync(ct))
                    .ToDictionary(x => x.Id, x => x.Name),
                _ => new Dictionary<int, string>()
            };

            foreach (var pair in found) _nameCache[$"{group.Key}:{pair.Key}"] = pair.Value;
        }

        foreach (var group in pairs.GroupBy(p => p.Attribute))
        {
            result[group.Key] = group.Select(p => p.Id)
                .ToDictionary(id => id, id => _nameCache.TryGetValue($"{group.Key}:{id}", out var name) ? name : $"{Describe(group.Key)} #{id}");
        }

        return result;
    }

    private async Task<IReadOnlyList<CouponScopeRuleView>> BuildViewsAsync(IReadOnlyList<CouponScopeRule> rules, CancellationToken ct)
    {
        if (rules.Count == 0) return [];

        var names = await LoadNamesAsync(
            rules.SelectMany(r => r.Values.Select(v => (r.Attribute, v.EntityId))).ToList(), ct);

        return rules
            .OrderBy(r => r.Polarity == ScopePolarity.IsNot ? 1 : 0)
            .Select(r => new CouponScopeRuleView(
                r.Attribute,
                r.Polarity,
                r.Values.Select(v => v.EntityId).OrderBy(id => id).ToList(),
                r.Values.Select(v => v.EntityId).OrderBy(id => id).Select(id => names[r.Attribute][id]).ToList()))
            .ToList();
    }

    /// <summary>Human scope text for the receipt and the reason message: "Footwear, Apex (any of)".</summary>
    private async Task<string> DescribeScopeAsync(Coupon coupon, CancellationToken ct)
    {
        var views = await BuildViewsAsync(EffectiveRules(coupon), ct);
        if (views.Count == 0) return "all products";

        var admits = views.Where(v => v.Polarity == ScopePolarity.Is).ToList();
        var excludes = views.Where(v => v.Polarity == ScopePolarity.IsNot).ToList();

        var text = admits.Count == 0
            ? "all products"
            : string.Join(", ", admits.SelectMany(v => v.EntityNames)) +
              (admits.Count > 1 ? $" ({(coupon.ScopeMatch == ScopeMatch.All ? "all of" : "any of")})" : "");

        if (excludes.Count > 0)
            text += $", except {string.Join(", ", excludes.SelectMany(v => v.EntityNames))}";

        return text;
    }

    // ------------------------------------------------------------------ registry reads

    private async Task<IReadOnlyList<CouponDto>> ToDtosAsync(IReadOnlyList<Coupon> coupons, CancellationToken ct)
    {
        var pairs = coupons.SelectMany(c => EffectiveRules(c).SelectMany(r => r.Values.Select(v => (r.Attribute, v.EntityId)))).ToList();
        var names = pairs.Count == 0
            ? new Dictionary<ScopeAttribute, Dictionary<int, string>>()
            : await LoadNamesAsync(pairs, ct);

        return coupons.Select(c =>
        {
            var views = EffectiveRules(c)
                .OrderBy(r => r.Polarity == ScopePolarity.IsNot ? 1 : 0)
                .Select(r => new CouponScopeRuleView(
                    r.Attribute,
                    r.Polarity,
                    r.Values.Select(v => v.EntityId).OrderBy(id => id).ToList(),
                    r.Values.Select(v => v.EntityId).OrderBy(id => id)
                        .Select(id => names.TryGetValue(r.Attribute, out var byId) && byId.TryGetValue(id, out var name)
                            ? name
                            : $"{Describe(r.Attribute)} #{id}").ToList()))
                .ToList();

            return new CouponDto(
                c.Id, c.Code, c.DiscountType, c.DiscountValue, c.MinOrderAmount, c.ExpiresAt, c.UsageLimit,
                c.UsageCount, c.IsActive, c.MaxDiscountCap, c.TargetType, c.TargetId, c.StartsAt, c.IsAutomatic,
                c.CampaignTitle, c.IsBannerPromoted, c.MinEligibleAmount, c.ScopeMatch, c.Exclusivity, views);
        }).ToList();
    }

    public async Task<IReadOnlyList<CouponDto>> ListCouponsAsync(CancellationToken ct = default)
    {
        var coupons = await QueryCoupons()
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync(ct);

        return await ToDtosAsync(coupons, ct);
    }

    public async Task<IReadOnlyList<CouponDto>> GetAvailableCouponsAsync(CancellationToken ct = default)
    {
        var now = _clock.UtcNow;
        var coupons = await QueryCoupons()
            .Where(c => c.IsActive && (!c.ExpiresAt.HasValue || c.ExpiresAt.Value > now) && (!c.StartsAt.HasValue || c.StartsAt.Value <= now))
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync(ct);

        return await ToDtosAsync(coupons, ct);
    }

    public async Task<IReadOnlyList<CouponDto>> GetActiveCampaignBannersAsync(CancellationToken ct = default)
    {
        var now = _clock.UtcNow;
        var coupons = await QueryCoupons()
            .Where(c => c.IsActive && c.IsBannerPromoted && (!c.ExpiresAt.HasValue || c.ExpiresAt.Value > now) && (!c.StartsAt.HasValue || c.StartsAt.Value <= now))
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync(ct);

        return await ToDtosAsync(coupons, ct);
    }

    // ------------------------------------------------------------------ writes

    public async Task<CouponDto> CreateCouponAsync(CreateCouponRequest request, CancellationToken ct = default)
    {
        var code = request.Code.Trim().ToUpperInvariant();
        if (await _db.Coupons.AnyAsync(c => c.Code == code, ct))
        {
            throw new ResourceConflictException($"Coupon with code '{code}' already exists.", "duplicate_coupon");
        }

        var rules = await NormalizeRulesAsync(request.ScopeRules, request.TargetType, request.TargetId, ct);

        var coupon = new Coupon
        {
            Code = code,
            DiscountType = request.DiscountType,
            DiscountValue = request.DiscountValue,
            MinOrderAmount = request.MinOrderAmount,
            MinEligibleAmount = request.MinEligibleAmount,
            MaxDiscountCap = request.MaxDiscountCap,
            TargetType = SummaryTargetType(rules),
            TargetId = SummaryTargetId(rules),
            ScopeMatch = request.ScopeMatch,
            Exclusivity = request.Exclusivity,
            ScopeRules = rules,
            StartsAt = request.StartsAt,
            ExpiresAt = request.ExpiresAt,
            UsageLimit = request.UsageLimit,
            UsageCount = 0,
            IsActive = true,
            IsAutomatic = request.IsAutomatic,
            CampaignTitle = request.CampaignTitle?.Trim(),
            IsBannerPromoted = request.IsBannerPromoted,
            CreatedAt = _clock.UtcNow
        };

        _db.Coupons.Add(coupon);
        await _db.SaveChangesAsync(ct);

        return (await ToDtosAsync([coupon], ct)).First();
    }

    public async Task<bool> ToggleCouponStatusAsync(int id, bool isActive, CancellationToken ct = default)
    {
        var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException($"Coupon {id} was not found.");

        coupon.IsActive = isActive;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<CouponDto> UpdateCouponAsync(int id, UpdateCouponRequest request, CancellationToken ct = default)
    {
        var coupon = await _db.Coupons
            .Include(c => c.ScopeRules).ThenInclude(r => r.Values)
            .FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException($"Coupon {id} was not found.");

        coupon.DiscountValue = request.DiscountValue;
        coupon.MinOrderAmount = request.MinOrderAmount;
        coupon.MaxDiscountCap = request.MaxDiscountCap;
        coupon.StartsAt = request.StartsAt;
        coupon.ExpiresAt = request.ExpiresAt;
        coupon.UsageLimit = request.UsageLimit;
        coupon.IsAutomatic = request.IsAutomatic;
        coupon.CampaignTitle = request.CampaignTitle?.Trim();
        coupon.IsBannerPromoted = request.IsBannerPromoted;

        if (request.MinEligibleAmount.HasValue) coupon.MinEligibleAmount = request.MinEligibleAmount.Value;
        if (request.ScopeMatch.HasValue) coupon.ScopeMatch = request.ScopeMatch.Value;
        if (request.Exclusivity.HasValue) coupon.Exclusivity = request.Exclusivity.Value;

        // An edit that says nothing about scope must not quietly widen a Footwear coupon to the whole store.
        if (request.ScopeRules is not null || request.TargetType is not null)
        {
            var rules = await NormalizeRulesAsync(request.ScopeRules, request.TargetType ?? CouponTargetType.Order, request.TargetId, ct);
            coupon.ScopeRules.Clear();
            foreach (var rule in rules) coupon.ScopeRules.Add(rule);
            coupon.TargetType = SummaryTargetType(rules);
            coupon.TargetId = SummaryTargetId(rules);
        }

        await _db.SaveChangesAsync(ct);

        return (await ToDtosAsync([coupon], ct)).First();
    }

    public async Task<bool> DeleteCouponAsync(int id, CancellationToken ct = default)
    {
        var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException($"Coupon {id} was not found.");

        _db.Coupons.Remove(coupon);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task ConsumeCouponAsync(string code, CancellationToken ct = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        await _db.Coupons
            .Where(c => c.Code == normalized)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsageCount, c => c.UsageCount + 1), ct);
    }

    // ------------------------------------------------------------------ impact preview

    public async Task<CouponScopePreviewResult> PreviewScopeAsync(CouponScopePreviewRequest request, CancellationToken ct = default)
    {
        var rules = await NormalizeRulesAsync(request.ScopeRules, request.TargetType, request.TargetId, ct);
        var compiled = CouponScopeMatcher.Compile(rules);

        var productIds = await _db.Products.AsNoTracking().Where(p => p.IsActive).Select(p => p.Id).ToListAsync(ct);
        var facts = await LoadFactsAsync(productIds, ct);
        var prices = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .Select(p => new { p.Id, p.Price, p.StockQuantity })
            .ToListAsync(ct);

        var matched = productIds
            .Where(id => facts.TryGetValue(id, out var fact) &&
                         CouponScopeMatcher.Matches(fact, compiled, request.ScopeMatch))
            .ToHashSet();

        var exposedStockValue = prices.Where(p => matched.Contains(p.Id)).Sum(p => p.Price * p.StockQuantity);
        var totalStockValue = prices.Sum(p => p.Price * p.StockQuantity);

        var basket = await _db.Orders.AsNoTracking()
            .Where(o => o.SubTotal > 0)
            .GroupBy(o => 1)
            .Select(g => new { Count = g.Count(), Total = g.Sum(o => o.SubTotal) })
            .FirstOrDefaultAsync(ct);

        PreviewValueBasis basis;
        decimal averageQualifyingValue;
        decimal qualifyingShare;

        if (matched.Count == 0)
        {
            basis = PreviewValueBasis.NotEstimated;
            averageQualifyingValue = 0m;
            qualifyingShare = 0m;
        }
        else if (basket is { Count: > 0 })
        {
            basis = PreviewValueBasis.OrderHistory;
            averageQualifyingValue = decimal.Round(basket.Total / basket.Count, 2, MidpointRounding.AwayFromZero);
            // Only the part of a typical basket this scope reaches can be discounted.
            qualifyingShare = totalStockValue > 0 ? exposedStockValue / totalStockValue : 1m;
        }
        else
        {
            // A young shop has no basket history to lean on, so one average-priced qualifying product is used.
            basis = PreviewValueBasis.AverageProductPrice;
            averageQualifyingValue = decimal.Round(
                prices.Where(p => matched.Contains(p.Id)).Average(p => p.Price), 2, MidpointRounding.AwayFromZero);
            qualifyingShare = 1m;
        }

        var forecastBase = decimal.Round(averageQualifyingValue * qualifyingShare, 2, MidpointRounding.AwayFromZero);
        var forecast = DiscountFor(request.DiscountType, request.DiscountValue, request.MaxDiscountCap, forecastBase);

        var sampleIds = productIds.Where(id => matched.Contains(id)).OrderBy(id => id).Take(6).ToList();
        var sampleNames = await LoadNamesAsync(
            sampleIds.Select(id => (ScopeAttribute.Product, id)).ToList(), ct);

        var conflicts = await FindConflictsAsync(rules, matched, facts, ct);

        return new CouponScopePreviewResult(
            productIds.Count,
            matched.Count,
            prices.Where(p => matched.Contains(p.Id)).Sum(p => p.StockQuantity),
            decimal.Round(exposedStockValue, 2, MidpointRounding.AwayFromZero),
            averageQualifyingValue,
            basis,
            forecast,
            sampleIds.Select(id => sampleNames[ScopeAttribute.Product][id]).ToList(),
            conflicts);
    }

    /// <summary>Which other live campaigns already reach the same products.</summary>
    private async Task<IReadOnlyList<ScopeConflictDto>> FindConflictsAsync(
        IReadOnlyList<CouponScopeRule> ownRules,
        HashSet<int> matched,
        Dictionary<int, ProductScopeFacts> facts,
        CancellationToken ct)
    {
        if (matched.Count == 0) return [];

        var ownSignature = RuleSignature(ownRules);
        var now = _clock.UtcNow;
        var others = await QueryCoupons()
            .Where(c => c.IsActive && (!c.ExpiresAt.HasValue || c.ExpiresAt.Value >= now) && (!c.StartsAt.HasValue || c.StartsAt.Value <= now))
            .ToListAsync(ct);

        var conflicts = new List<ScopeConflictDto>();
        foreach (var other in others)
        {
            if (RuleSignature(EffectiveRules(other)) == ownSignature) continue;

            var compiled = ResolveCompiledRules(other);
            var overlap = matched.Count(id =>
                facts.TryGetValue(id, out var fact) && CouponScopeMatcher.Matches(fact, compiled, other.ScopeMatch));

            if (overlap > 0)
            {
                conflicts.Add(new ScopeConflictDto(other.Code, other.CampaignTitle, overlap, other.IsAutomatic));
            }
        }

        return conflicts.OrderByDescending(c => c.OverlappingProducts).Take(5).ToList();
    }

    private static string RuleSignature(IReadOnlyList<CouponScopeRule> rules) =>
        string.Join("|", rules
            .OrderBy(r => r.Attribute)
            .ThenBy(r => r.Polarity)
            .Select(r => $"{r.Attribute}:{r.Polarity}:{string.Join(",", r.Values.Select(v => v.EntityId).OrderBy(id => id))}"));
}
