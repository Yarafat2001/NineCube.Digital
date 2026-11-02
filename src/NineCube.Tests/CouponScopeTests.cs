using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;
using NineCube.Infrastructure.Caching;
using NineCube.Infrastructure.Identity;
using NineCube.Infrastructure.Persistence;
using NineCube.Tests.Infrastructure;
using Xunit.Abstractions;

namespace NineCube.Tests;

/// <summary>
/// The scope engine against a real PostgreSQL database: which basket lines a coupon may touch, how
/// much that is worth, and what the operator is told when the scope reaches nothing. These are the
/// numbers a shop loses money on if they are wrong, so nothing here is mocked.
/// </summary>
public sealed class CouponScopeTests(PostgresFixture fixture, ITestOutputHelper output)
    : IClassFixture<PostgresFixture>, IAsyncLifetime
{
    private AppDbContext _db = null!;
    private CouponService _coupons = null!;
    private DiscountPolicyService _policies = null!;
    private TestCurrentUser _user = null!;

    private int _phones;
    private int _audio;
    private int _cables;
    private int _wearables;
    private int _samsung;
    private int _apple;
    private int _galaxyBuds;
    private int _phoneA;      // Samsung phone   100,000 x5  (Phones)
    private int _phoneB;     // Apple phone     150,000 x2  (Phones)
    private int _buds;        // Samsung buds     10,000 x10 (Audio)
    private int _cable;       // no brand          1,000 x100 (Cables)

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        output.WriteLine($"[CouponScopeTests] database: {fixture.Mode}");

        _db = fixture.NewDbContext();
        _user = new TestCurrentUser();
        _policies = NewPolicyService(_db, _user);
        _coupons = new CouponService(_db, new SystemClock(), _policies, _user, new AuditWriter(_db, _user, new SystemClock()));
        await SeedCatalogueAsync();
    }

    /// <summary>The policy service with a cache of its own, so no test can read another test's limits.</summary>
    private static DiscountPolicyService NewPolicyService(AppDbContext db, ICurrentUser user) =>
        new(db,
            new MemoryCacheService(new MemoryCache(new MemoryCacheOptions())),
            new AuditWriter(db, user, new SystemClock()),
            new SystemClock());

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
    }

    private async Task SeedCatalogueAsync()
    {
        // EnsureCreated builds the schema but does not insert the model's seed categories, so the
        // whole catalogue these tests rely on is written here.
        var phones = AddCategory("Phones", "/electronics/phones/");
        var audio = AddCategory("Audio", "/electronics/audio/");
        var cables = AddCategory("Cables", "/electronics/cables/");
        var wearables = AddCategory("Wearables", "/electronics/wearables/");
        var featured = new Tag { Name = "Featured" };
        _db.Tags.Add(featured);
        await _db.SaveChangesAsync();
        _phones = phones.Id;
        _audio = audio.Id;
        _cables = cables.Id;
        _wearables = wearables.Id;

        var samsung = AddBrand("Samsung", "samsung");
        var apple = AddBrand("Apple", "apple");
        await _db.SaveChangesAsync();
        _samsung = samsung.Id;
        _apple = apple.Id;

        var budsLine = new ProductLine { BrandId = _samsung, Name = "Galaxy Buds", Slug = "galaxy-buds", SortOrder = 1 };
        _db.ProductLines.Add(budsLine);
        await _db.SaveChangesAsync();
        _galaxyBuds = budsLine.Id;

        _phoneA = await AddProductAsync("TST-PH-001", "Galaxy S25 256GB", 100_000m, 5, _phones, _samsung);
        _phoneB = await AddProductAsync("TST-PH-002", "iPhone 17 128GB", 150_000m, 2, _phones, _apple);
        _buds = await AddProductAsync("TST-AU-001", "Galaxy Buds FE", 10_000m, 10, _audio, _samsung, _galaxyBuds);
        _cable = await AddProductAsync("TST-CA-001", "USB-C Cable 1m", 1_000m, 100, _cables);
    }

    private Category AddCategory(string name, string path)
    {
        var category = new Category { Name = name, Slug = name.ToLowerInvariant(), Path = path, Depth = 2, SortOrder = 1 };
        _db.Categories.Add(category);
        return category;
    }

    private Brand AddBrand(string name, string slug)
    {
        var brand = new Brand { Name = name, Slug = slug, CreatedAt = DateTime.UtcNow };
        _db.Brands.Add(brand);
        return brand;
    }

    private async Task<int> AddProductAsync(
        string sku, string name, decimal price, int stock, int categoryId, int? brandId = null, int? lineId = null)
    {
        var product = new Product
        {
            Sku = sku,
            Slug = sku.ToLowerInvariant(),
            Name = name,
            Price = price,
            StockQuantity = stock,
            IsActive = true,
            BrandId = brandId,
            ProductLineId = lineId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Categories = [new ProductCategory { CategoryId = categoryId, IsPrimary = true }]
        };

        _db.Products.Add(product);
        await _db.SaveChangesAsync();
        return product.Id;
    }

    // ------------------------------------------------------------------ helpers

    private async Task<int> CreateScopedAsync(
        string code,
        decimal percent,
        CouponScopeRuleDto[] rules,
        ScopeMatch match = ScopeMatch.Any,
        DiscountExclusivity exclusivity = DiscountExclusivity.BestOnly,
        bool automatic = false,
        decimal minEligibleAmount = 0m,
        decimal minOrderAmount = 0m,
        decimal? cap = null)
    {
        var created = await _coupons.CreateCouponAsync(new CreateCouponRequest(
            code, DiscountType.Percentage, percent, minOrderAmount,
            MaxDiscountCap: cap, MinEligibleAmount: minEligibleAmount, ScopeMatch: match,
            Exclusivity: exclusivity, IsAutomatic: automatic, ScopeRules: rules));

        return created.Id;
    }

    private static CouponScopeRuleDto Is(ScopeAttribute attribute, params int[] ids) =>
        new(attribute, ScopePolarity.Is, ids);

    private static CouponScopeRuleDto IsNot(ScopeAttribute attribute, params int[] ids) =>
        new(attribute, ScopePolarity.IsNot, ids);

    private CartLineItemDto Line(int productId, int quantity = 1, decimal? claimedUnitPrice = null, int? spoofBrandId = null) =>
        new(productId, quantity, claimedUnitPrice ?? PriceOf(productId), BrandId: spoofBrandId);

    private decimal PriceOf(int productId) => productId switch
    {
        _ when productId == _phoneA => 100_000m,
        _ when productId == _phoneB => 150_000m,
        _ when productId == _buds => 10_000m,
        _ => 1_000m
    };

    // ------------------------------------------------------------------ eligible amount

    [Fact]
    public async Task A_category_scope_discounts_only_the_qualifying_lines()
    {
        var id = await CreateScopedAsync("PHONES10", 10, [Is(ScopeAttribute.Category, _phones)]);

        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "PHONES10", 102_000m, [Line(_phoneA), Line(_cable, quantity: 2)]));

        result.IsValid.Should().BeTrue(result.Reason);
        result.EligibleAmount.Should().Be(100_000m);
        result.DiscountAmount.Should().Be(10_000m);
        result.ScopeSummary.Should().Be("Phones");

        // Before the scope rules existed the same basket lost 10% of the cable lines too.
        (await _coupons.ListCouponsAsync()).Single(c => c.Id == id).ScopeRules!
            .Single().EntityNames.Should().BeEquivalentTo(["Phones"]);
    }

    [Fact]
    public async Task Catalogue_facts_beat_whatever_the_payload_claims()
    {
        await CreateScopedAsync("APPLE10", 10, [Is(ScopeAttribute.Brand, _apple)]);

        // The cable is sent as if it were an Apple phone; the catalogue says otherwise.
        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "APPLE10", 151_000m, [Line(_phoneB), Line(_cable, spoofBrandId: _apple)]));

        result.IsValid.Should().BeTrue(result.Reason);
        result.EligibleAmount.Should().Be(150_000m);
        result.DiscountAmount.Should().Be(15_000m);
    }

    [Fact]
    public async Task A_scoped_coupon_on_a_basket_of_nothing_says_what_is_missing()
    {
        await CreateScopedAsync("PHONES10", 10, [Is(ScopeAttribute.Category, _phones)]);

        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest("PHONES10", 0m, []));

        result.IsValid.Should().BeFalse();
        result.Reason.Should().Contain("add one of them to the basket first");
        result.ScopeSummary.Should().Be("Phones");
    }

    [Fact]
    public async Task A_basket_outside_the_scope_is_rejected_with_the_scope_named()
    {
        await CreateScopedAsync("PHONES10", 10, [Is(ScopeAttribute.Category, _phones)]);

        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest("PHONES10", 10_000m, [Line(_buds)]));

        result.IsValid.Should().BeFalse();
        result.Reason.Should().Be("This promotion only applies to Phones.");
        result.EligibleAmount.Should().Be(0m);
    }

    [Fact]
    public async Task A_scope_that_names_no_target_is_refused_instead_of_becoming_storewide()
    {
        var act = () => _coupons.CreateCouponAsync(new CreateCouponRequest(
            "EMPTYRULE", DiscountType.Percentage, 10, 0m,
            ScopeRules: [Is(ScopeAttribute.Category)]));

        await act.Should().ThrowAsync<BusinessValidationException>()
            .WithMessage("*has no selection*");

        var legacy = () => _coupons.CreateCouponAsync(new CreateCouponRequest(
            "NOTTARGET", DiscountType.Percentage, 10, 0m, TargetType: CouponTargetType.Category));

        await legacy.Should().ThrowAsync<BusinessValidationException>()
            .WithMessage("*or set it to apply to the whole order*");
    }

    [Fact]
    public async Task An_unknown_catalogue_id_in_a_scope_is_refused()
    {
        var act = () => _coupons.CreateCouponAsync(new CreateCouponRequest(
            "GHOST99", DiscountType.Percentage, 10, 0m,
            ScopeRules: [Is(ScopeAttribute.Brand, 99_999)]));

        await act.Should().ThrowAsync<BusinessValidationException>();
    }

    // ------------------------------------------------------------------ Any / All / except

    [Fact]
    public async Task Any_widens_the_scope_to_every_rule_and_All_narrows_it()
    {
        var rules = new[] { Is(ScopeAttribute.Category, _phones), Is(ScopeAttribute.Brand, _samsung) };
        await CreateScopedAsync("MIXANY", 10, rules, ScopeMatch.Any);
        await CreateScopedAsync("MIXALL", 10, rules, ScopeMatch.All);

        var basket = new[] { Line(_phoneA), Line(_phoneB), Line(_buds), Line(_cable) };

        var any = await _coupons.ValidateCouponAsync(new ApplyCouponRequest("MIXANY", 261_000m, basket));
        var all = await _coupons.ValidateCouponAsync(new ApplyCouponRequest("MIXALL", 261_000m, basket));

        any.EligibleAmount.Should().Be(260_000m, "a phone of any brand or any Samsung product counts");
        all.EligibleAmount.Should().Be(100_000m, "only the Samsung phone sits in both rules");
    }

    [Fact]
    public async Task An_exclusion_subtracts_under_both_match_modes()
    {
        var rules = new[] { Is(ScopeAttribute.Category, _phones), IsNot(ScopeAttribute.Brand, _apple) };
        var id = await CreateScopedAsync("NOSURE", 10, rules, ScopeMatch.All);

        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "NOSURE", 250_000m, [Line(_phoneA), Line(_phoneB)]));

        result.IsValid.Should().BeTrue(result.Reason);
        result.EligibleAmount.Should().Be(100_000m);
        result.ScopeSummary.Should().Be("Phones, except Apple");

        (await _coupons.ListCouponsAsync()).Single(c => c.Id == id).ScopeRules!
            .Select(r => $"{r.Attribute}:{r.Polarity}").Should().BeEquivalentTo(["Category:Is", "Brand:IsNot"]);
    }

    [Fact]
    public async Task A_series_scope_reaches_only_that_series()
    {
        await CreateScopedAsync("BUDS20", 20, [Is(ScopeAttribute.ProductLine, _galaxyBuds)]);

        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "BUDS20", 260_000m, [Line(_phoneA), Line(_buds, quantity: 2)]));

        result.EligibleAmount.Should().Be(20_000m);
        result.DiscountAmount.Should().Be(4_000m);
        result.ScopeSummary.Should().Be("Galaxy Buds");
    }

    // ------------------------------------------------------------------ stacking policy

    [Fact]
    public async Task Stack_by_scope_adds_a_second_discount_but_never_on_the_same_line()
    {
        await CreateScopedAsync("PHONES10", 10, [Is(ScopeAttribute.Category, _phones)],
            exclusivity: DiscountExclusivity.StackByScope);
        await CreateScopedAsync("SAMSUNG5", 5, [Is(ScopeAttribute.Brand, _samsung)],
            exclusivity: DiscountExclusivity.StackByScope, automatic: true);

        var result = await _coupons.EvaluateCartPromotionsAsync(new EvaluateCartPromotionsRequest(
            260_000m, [Line(_phoneA), Line(_phoneB), Line(_buds)], "PHONES10"));

        result.TotalDiscountAmount.Should().Be(25_500m);
        var applied = result.AppliedDiscounts!;
        applied.Should().HaveCount(2);
        result.EffectiveDiscount!.ScopeSummary.Should().Contain("PHONES10 + SAMSUNG5");

        // The Samsung phone was already discounted by the manual code, so only the buds add on.
        applied[1].DiscountAmount.Should().Be(500m);
        applied[1].EligibleAmount.Should().Be(10_000m);
    }

    [Fact]
    public async Task Best_only_still_picks_the_single_largest_discount()
    {
        await CreateScopedAsync("PHONES10", 10, [Is(ScopeAttribute.Category, _phones)],
            exclusivity: DiscountExclusivity.StackByScope);
        await CreateScopedAsync("SAMSUNG5", 5, [Is(ScopeAttribute.Brand, _samsung)], automatic: true);

        var result = await _coupons.EvaluateCartPromotionsAsync(new EvaluateCartPromotionsRequest(
            260_000m, [Line(_phoneA), Line(_phoneB), Line(_buds)], "PHONES10"));

        result.AppliedDiscounts!.Should().HaveCount(1);
        result.TotalDiscountAmount.Should().Be(25_000m);
        result.AutomaticDiscount!.DiscountAmount.Should().Be(5_500m, "evaluated, but never applied");
    }

    [Fact]
    public async Task An_exclusive_coupon_refuses_to_share_the_order()
    {
        await CreateScopedAsync("PHONESLOCK", 10, [Is(ScopeAttribute.Category, _phones)],
            exclusivity: DiscountExclusivity.Exclusive);
        await CreateScopedAsync("SAMSUNG5", 5, [Is(ScopeAttribute.Brand, _samsung)],
            exclusivity: DiscountExclusivity.StackByScope, automatic: true);

        var result = await _coupons.EvaluateCartPromotionsAsync(new EvaluateCartPromotionsRequest(
            260_000m, [Line(_phoneA), Line(_phoneB), Line(_buds)], "PHONESLOCK"));

        result.AppliedDiscounts!.Should().HaveCount(1);
        result.TotalDiscountAmount.Should().Be(25_000m);
    }

    // ------------------------------------------------------------------ minimum in-scope spend

    [Fact]
    public async Task The_minimum_is_measured_on_the_scope_not_the_whole_basket()
    {
        await CreateScopedAsync("BIGPHONES", 10, [Is(ScopeAttribute.Category, _phones)],
            minEligibleAmount: 200_000m);

        var rejected = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "BIGPHONES", 250_000m, [Line(_phoneA), Line(_cable, quantity: 150)]));

        rejected.IsValid.Should().BeFalse();
        rejected.Reason.Should().Be("Spend at least 200000.00 on Phones to use this promotion.");
        rejected.EligibleAmount.Should().Be(100_000m, "the cable lines cannot meet a phone minimum");

        var accepted = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "BIGPHONES", 250_000m, [Line(_phoneA), Line(_phoneB)]));

        accepted.IsValid.Should().BeTrue(accepted.Reason);
        accepted.DiscountAmount.Should().Be(25_000m);
    }

    // ------------------------------------------------------------------ edits

    [Fact]
    public async Task An_edit_that_says_nothing_about_scope_keeps_the_stored_rules()
    {
        var id = await CreateScopedAsync("APPLE10", 10, [Is(ScopeAttribute.Brand, _apple)]);

        await _coupons.UpdateCouponAsync(id, new UpdateCouponRequest(
            DiscountValue: 18, MinOrderAmount: 5_000m, MaxDiscountCap: 20_000m));

        var stored = await _db.Coupons.Include(c => c.ScopeRules).ThenInclude(r => r.Values)
            .SingleAsync(c => c.Id == id);

        stored.ScopeRules.Should().HaveCount(1);
        stored.ScopeRules.Single().Attribute.Should().Be(ScopeAttribute.Brand);
        stored.ScopeRules.Single().Values.Single().EntityId.Should().Be(_apple);
        stored.TargetType.Should().Be(CouponTargetType.Brand);
        stored.TargetId.Should().Be(_apple);

        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "APPLE10", 150_000m, [Line(_phoneB), Line(_phoneA)]));

        result.EligibleAmount.Should().Be(150_000m, "the stored brand scope survived the edit");
        result.DiscountAmount.Should().Be(20_000m, "18% of the Apple line, held down by the new cap");
    }

    [Fact]
    public async Task An_explicit_empty_rule_list_is_how_an_operator_widens_a_coupon_to_storewide()
    {
        var id = await CreateScopedAsync("APPLE10", 10, [Is(ScopeAttribute.Brand, _apple)]);

        await _coupons.UpdateCouponAsync(id, new UpdateCouponRequest(
            DiscountValue: 10, MinOrderAmount: 0m, ScopeRules: []));

        var stored = await _db.Coupons.Include(c => c.ScopeRules).SingleAsync(c => c.Id == id);
        stored.ScopeRules.Should().BeEmpty();
        stored.TargetType.Should().Be(CouponTargetType.Order);

        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "APPLE10", 260_000m, [Line(_phoneA), Line(_phoneB), Line(_buds)]));

        result.EligibleAmount.Should().Be(260_000m);
        result.ScopeSummary.Should().Be("all products");
    }

    [Fact]
    public async Task Replacing_rules_moves_the_scope_rather_than_adding_to_it()
    {
        var id = await CreateScopedAsync("SWAP10", 10, [Is(ScopeAttribute.Category, _phones)]);

        await _coupons.UpdateCouponAsync(id, new UpdateCouponRequest(
            DiscountValue: 10, MinOrderAmount: 0m,
            ScopeRules: [Is(ScopeAttribute.Category, _audio)]));

        var stored = await _db.Coupons.Include(c => c.ScopeRules).ThenInclude(r => r.Values)
            .SingleAsync(c => c.Id == id);

        stored.ScopeRules.Should().HaveCount(1);
        stored.ScopeRules.Single().Values.Single().EntityId.Should().Be(_audio);
    }

    // ------------------------------------------------------------------ legacy rows

    [Fact]
    public async Task A_legacy_row_with_one_target_is_read_as_one_rule()
    {
        _db.Coupons.Add(new Coupon
        {
            Code = "OLDPHONES",
            DiscountType = DiscountType.Percentage,
            DiscountValue = 10,
            TargetType = CouponTargetType.Category,
            TargetId = _phones,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        var row = (await _coupons.ListCouponsAsync()).Single(c => c.Code == "OLDPHONES");
        var stored = row.ScopeRules!;
        stored.Single().Attribute.Should().Be(ScopeAttribute.Category);
        stored.Single().EntityNames.Should().BeEquivalentTo(["Phones"]);

        var result = await _coupons.ValidateCouponAsync(new ApplyCouponRequest(
            "OLDPHONES", 101_000m, [Line(_phoneA), Line(_cable)]));

        result.EligibleAmount.Should().Be(100_000m);
        result.DiscountAmount.Should().Be(10_000m);
    }

    // ------------------------------------------------------------------ reach preview

    [Fact]
    public async Task The_preview_counts_products_units_and_stock_value_in_the_scope()
    {
        var preview = await _coupons.PreviewScopeAsync(new CouponScopePreviewRequest(
            ScopeRules: [Is(ScopeAttribute.Category, _phones)],
            DiscountType: DiscountType.Percentage,
            DiscountValue: 10));

        preview.TotalActiveProducts.Should().Be(4);
        preview.MatchedProducts.Should().Be(2);
        preview.MatchedUnits.Should().Be(7);
        preview.ExposedStockValue.Should().Be(800_000m);
        preview.SampleProducts.Should().BeEquivalentTo(["Galaxy S25 256GB", "iPhone 17 128GB"]);
    }

    [Fact]
    public async Task The_forecast_says_what_it_was_measured_against()
    {
        var preview = await _coupons.PreviewScopeAsync(new CouponScopePreviewRequest(
            ScopeRules: [Is(ScopeAttribute.Category, _phones)],
            DiscountType: DiscountType.Percentage,
            DiscountValue: 10));

        preview.ValueBasis.Should().Be(PreviewValueBasis.AverageProductPrice);
        preview.AverageQualifyingValue.Should().Be(125_000m);
        preview.ForecastDiscount.Should().Be(12_500m);
    }

    [Fact]
    public async Task A_scope_that_reaches_nothing_is_reported_as_nothing()
    {
        var preview = await _coupons.PreviewScopeAsync(new CouponScopePreviewRequest(
            ScopeRules: [Is(ScopeAttribute.Category, _wearables)],
            DiscountType: DiscountType.Percentage,
            DiscountValue: 25));

        preview.MatchedProducts.Should().Be(0);
        preview.ExposedStockValue.Should().Be(0m);
        preview.ValueBasis.Should().Be(PreviewValueBasis.NotEstimated);
        preview.ForecastDiscount.Should().Be(0m);
    }

    [Fact]
    public async Task The_preview_lists_the_live_campaigns_already_reaching_those_products()
    {
        await CreateScopedAsync("AUTOSAMSUNG", 5, [Is(ScopeAttribute.Brand, _samsung)], automatic: true);
        await CreateScopedAsync("CABLES5", 5, [Is(ScopeAttribute.Category, _cables)]);

        var preview = await _coupons.PreviewScopeAsync(new CouponScopePreviewRequest(
            ScopeRules: [Is(ScopeAttribute.Category, _phones)],
            DiscountType: DiscountType.Percentage,
            DiscountValue: 10));

        preview.Conflicts.Should().ContainSingle()
            .Which.Should().Match<ScopeConflictDto>(c =>
                c.Code == "AUTOSAMSUNG" && c.OverlappingProducts == 1 && c.IsAutomatic);
    }

    [Fact]
    public async Task A_storewide_preview_uses_the_order_average_when_the_shop_has_sales()
    {
        var customer = new Customer { Name = "Test Buyer", Email = $"scope-{Guid.NewGuid():N}@ninecube.demo", CreatedAt = DateTime.UtcNow };
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();

        _db.Orders.Add(new Order
        {
            CustomerId = customer.Id,
            SubTotal = 30_000m,
            TotalAmount = 30_000m,
            Status = OrderStatus.Pending,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        var preview = await _coupons.PreviewScopeAsync(new CouponScopePreviewRequest(
            DiscountType: DiscountType.Percentage,
            DiscountValue: 10));

        preview.MatchedProducts.Should().Be(4, "a storewide scope reaches the whole catalogue");
        preview.ValueBasis.Should().Be(PreviewValueBasis.OrderHistory);
        preview.AverageQualifyingValue.Should().Be(30_000m);
        preview.ForecastDiscount.Should().BeGreaterThan(0m);
    }
}
