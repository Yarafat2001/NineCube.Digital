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
/// The three moderation layers against a real PostgreSQL database: the store's own discount limits,
/// what a coupon would have cost on the orders that actually happened, and the second signature a large
/// discount needs before it can spend money.
/// </summary>
public sealed class CouponModerationTests(PostgresFixture fixture, ITestOutputHelper output)
    : IClassFixture<PostgresFixture>, IAsyncLifetime
{
    private AppDbContext _db = null!;
    private CouponService _coupons = null!;
    private DiscountPolicyService _policies = null!;
    private TestCurrentUser _user = null!;

    private int _phones;
    private int _phone;
    private int _cable;
    private int _writer;
    private int _reviewer;
    private int _customer;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        output.WriteLine($"[CouponModerationTests] database: {fixture.Mode}");

        _db = fixture.NewDbContext();
        _user = new TestCurrentUser();

        // One cache per test, so no other test's limits can be read here.
        _policies = new DiscountPolicyService(
            _db, new MemoryCacheService(new MemoryCache(new MemoryCacheOptions())),
            new AuditWriter(_db, _user, new SystemClock()), new SystemClock());
        _coupons = new CouponService(
            _db, new SystemClock(), _policies, _user, new AuditWriter(_db, _user, new SystemClock()));

        await SeedAsync();
    }

    public async Task DisposeAsync() => await _db.DisposeAsync();

    private async Task SeedAsync()
    {
        var now = DateTime.UtcNow;

        var phones = new Category { Name = "Phones", Slug = "phones", Path = "/electronics/phones/", Depth = 2, SortOrder = 1 };
        var cables = new Category { Name = "Cables", Slug = "cables", Path = "/electronics/cables/", Depth = 2, SortOrder = 1 };
        _db.Categories.AddRange(phones, cables);
        await _db.SaveChangesAsync();
        _phones = phones.Id;

        _phone = await AddProductAsync("TST-MOD-001", "Galaxy S25 256GB", 100_000m, _phones);
        _cable = await AddProductAsync("TST-MOD-002", "USB-C Cable 1m", 1_000m, cables.Id);

        var writer = new User { Email = "writer@ninecube.demo", Role = UserRole.Administrator, CreatedAt = now };
        var reviewer = new User { Email = "reviewer@ninecube.demo", Role = UserRole.Administrator, CreatedAt = now };
        _db.Users.AddRange(writer, reviewer);
        await _db.SaveChangesAsync();
        _writer = writer.Id;
        _reviewer = reviewer.Id;

        _user.UserId = _writer;
        _user.Email = writer.Email;

        var buyer = new Customer { Name = "Replay Buyer", Email = "replay@ninecube.demo", CreatedAt = now };
        _db.Customers.Add(buyer);
        await _db.SaveChangesAsync();
        _customer = buyer.Id;
    }

    private async Task<int> AddProductAsync(string sku, string name, decimal price, int categoryId)
    {
        var product = new Product
        {
            Sku = sku,
            Slug = sku.ToLowerInvariant(),
            Name = name,
            Price = price,
            StockQuantity = 20,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Categories = [new ProductCategory { CategoryId = categoryId, IsPrimary = true }]
        };

        _db.Products.Add(product);
        await _db.SaveChangesAsync();
        return product.Id;
    }

    private async Task AddOrderAsync(
        decimal subTotal,
        decimal giveaway,
        DateTime createdAt,
        OrderStatus status = OrderStatus.Confirmed,
        params (int ProductId, int Quantity, decimal UnitPrice)[] lines)
    {
        _db.Orders.Add(new Order
        {
            CustomerId = _customer,
            SubTotal = subTotal,
            DiscountAmount = giveaway,
            TotalAmount = subTotal - giveaway,
            Status = status,
            CreatedAt = createdAt,
            UpdatedAt = createdAt,
            Items = lines
                .Select(l => new OrderItem
                {
                    ProductId = l.ProductId,
                    Quantity = l.Quantity,
                    UnitPrice = l.UnitPrice,
                    LineTotal = l.Quantity * l.UnitPrice,
                    ProductName = "",
                    PrimaryCategoryName = "Phones"
                })
                .ToList()
        });

        await _db.SaveChangesAsync();
    }

    private Task<CouponDto> CreateAsync(string code, decimal percent) =>
        _coupons.CreateCouponAsync(new CreateCouponRequest(code, DiscountType.Percentage, percent, 0m));

    /// <summary>Puts the second administrator at the keyboard.</summary>
    private void AsReviewer() => (_user.UserId, _user.Email) = (_reviewer, "reviewer@ninecube.demo");

    private Task<Coupon> StoredAsync(int id) =>
        _db.Coupons.AsNoTracking().SingleAsync(c => c.Id == id);

    private Task<string?> AuditDetailsAsync(string action) =>
        _db.AuditLogs.AsNoTracking().Where(a => a.Action == action).Select(a => a.Details).SingleOrDefaultAsync();

    // ---------------------------------------------------------------- the limits

    [Fact]
    public async Task The_policy_lands_in_the_setting_table_and_the_audit_trail()
    {
        var saved = await _policies.SaveAsync(new DiscountPolicy(30, 2_000, 40, 50_000, 25, 2_000));

        saved.MaxPercentageOff.Should().Be(30);
        saved.ApprovalAboveAmount.Should().Be(2_000);

        (await _policies.GetAsync()).Should().Be(saved, "the limits are read back through the same cache the coupons use");

        var keys = await _db.Settings.AsNoTracking().Select(s => s.Key).ToListAsync();
        keys.Should().Contain([
            SettingKeys.MaxPercentageOff, SettingKeys.MaxAmountPerOrder, SettingKeys.MaxShareOfOrder,
            SettingKeys.WeeklySpendCap, SettingKeys.ApprovalAbovePercentage, SettingKeys.ApprovalAboveAmount]);

        var audit = await _db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == AuditActions.DiscountPolicyUpdated);
        audit.UserId.Should().Be(_writer);
        audit.Details.Should().Contain("DiscountPolicy.MaxPercentageOff: (unset) -> 30");
    }

    [Fact]
    public async Task An_approval_threshold_above_the_hard_limit_is_a_rule_nothing_could_ever_reach()
    {
        var act = () => _policies.SaveAsync(new DiscountPolicy(30, 0, 0, 0, ApprovalAbovePercentage: 60));

        await act.Should().ThrowAsync<BusinessValidationException>().WithMessage("*no coupon could ever reach it*");
    }

    [Fact]
    public async Task A_coupon_above_the_stores_own_rate_limit_is_refused_before_it_is_written()
    {
        await _policies.SaveAsync(new DiscountPolicy(30, 0, 0, 0));

        var act = () => CreateAsync("BIG40", 40);
        await act.Should().ThrowAsync<BusinessValidationException>()
            .WithMessage("*Your policy allows at most 30% off. This coupon gives 40%.*");

        (await _db.Coupons.AnyAsync(c => c.Code == "BIG40")).Should().BeFalse();
    }

    [Fact]
    public async Task An_edit_that_raises_a_live_coupon_above_the_limit_leaves_the_stored_numbers_alone()
    {
        var created = await CreateAsync("SMALL10", 10);
        await _policies.SaveAsync(new DiscountPolicy(30, 0, 0, 0));

        var act = () => _coupons.UpdateCouponAsync(created.Id, new UpdateCouponRequest(DiscountValue: 45, MinOrderAmount: 0m));
        await act.Should().ThrowAsync<BusinessValidationException>().WithMessage("*at most 30% off*");

        (await StoredAsync(created.Id)).DiscountValue.Should().Be(10);
    }

    [Fact]
    public async Task A_week_already_over_the_spend_cap_blocks_a_new_campaign()
    {
        await AddOrderAsync(100_000m, 60_000m, DateTime.UtcNow.AddDays(-2));
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 50_000));

        var act = () => CreateAsync("NEW10", 10);
        await act.Should().ThrowAsync<BusinessValidationException>()
            .WithMessage("*last 7 days already used BDT 60,000*");

        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 100_000));
        (await CreateAsync("NEW10", 10)).IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task A_cancelled_orders_giveaway_does_not_count_against_the_cap()
    {
        await AddOrderAsync(100_000m, 60_000m, DateTime.UtcNow.AddDays(-1), OrderStatus.Cancelled);
        await AddOrderAsync(50_000m, 8_000m, DateTime.UtcNow.AddDays(-1), OrderStatus.Rejected);
        await AddOrderAsync(40_000m, 4_000m, DateTime.UtcNow.AddDays(-1));
        await AddOrderAsync(90_000m, 9_000m, DateTime.UtcNow.AddDays(-40), OrderStatus.Confirmed);

        (await _policies.PromoSpendAsync(7)).Should().Be(4_000m,
            "only an order that still stand took money off the shop");
    }

    // ---------------------------------------------------------------- the replay

    [Fact]
    public async Task The_replay_prices_the_coupon_on_the_orders_that_actually_happened()
    {
        await AddOrderAsync(102_000m, 0m, DateTime.UtcNow.AddDays(-3),
            lines: [(_phone, 1, 100_000m), (_cable, 2, 1_000m)]);
        await AddOrderAsync(2_000m, 0m, DateTime.UtcNow.AddDays(-1), lines: [(_cable, 2, 1_000m)]);

        var replay = await _coupons.ReplayAgainstOrdersAsync(new CouponOrderReplayRequest(
            ScopeRules: [new CouponScopeRuleDto(ScopeAttribute.Category, ScopePolarity.Is, [_phones])],
            DiscountType: DiscountType.Percentage,
            DiscountValue: 10));

        replay.HasOrders.Should().BeTrue();
        replay.OrdersInWindow.Should().Be(2);
        replay.OrdersQualified.Should().Be(1, "the cable-only order is outside the scope");
        replay.TotalGiveaway.Should().Be(10_000m);
        replay.AverageGiveawayPerOrder.Should().Be(10_000m);
        replay.ShareOfOrderValuePercent.Should().Be(9.8m);
        replay.Notes.Should().BeEmpty();

        replay.TopProducts.Should().ContainSingle().Which
            .Should().Match<ReplayProductImpact>(p => p.ProductName == "Galaxy S25 256GB" && p.Giveaway == 10_000m && p.TimesDiscounted == 1);
    }

    [Fact]
    public async Task A_fixed_amount_is_replayed_against_the_same_orders()
    {
        await AddOrderAsync(102_000m, 0m, DateTime.UtcNow.AddDays(-2), lines: [(_phone, 1, 100_000m), (_cable, 2, 1_000m)]);

        var replay = await _coupons.ReplayAgainstOrdersAsync(new CouponOrderReplayRequest(
            DiscountType: DiscountType.FixedAmount, DiscountValue: 4_200m));

        replay.TotalGiveaway.Should().Be(4_200m);
        replay.ShareOfOrderValuePercent.Should().Be(4.1m, "4,200 of a 102,000 order");

        // The one giveaway is split across the lines it discounted, so the bleed is visible per product.
        replay.TopProducts.Should().HaveCount(2);
        replay.TopProducts.First().ProductName.Should().Be("Galaxy S25 256GB");
        replay.TopProducts.Sum(p => p.Giveaway).Should().Be(4_200m);
    }

    [Fact]
    public async Task A_shop_with_no_orders_says_there_is_nothing_to_measure()
    {
        var replay = await _coupons.ReplayAgainstOrdersAsync(new CouponOrderReplayRequest(
            DiscountType: DiscountType.Percentage, DiscountValue: 10));

        replay.HasOrders.Should().BeFalse();
        replay.OrdersInWindow.Should().Be(0);
        replay.TotalGiveaway.Should().Be(0m);
        replay.TopProducts.Should().BeEmpty();
        replay.Notes.Should().ContainSingle().Which.Should()
            .Contain("no orders at all in the last 30 days");
    }

    [Fact]
    public async Task Orders_outside_the_window_are_left_out()
    {
        await AddOrderAsync(100_000m, 0m, DateTime.UtcNow.AddDays(-61), lines: [(_phone, 1, 100_000m)]);

        (await _coupons.ReplayAgainstOrdersAsync(new CouponOrderReplayRequest(DiscountValue: 10, Days: 30)))
            .OrdersInWindow.Should().Be(0);

        var ninety = await _coupons.ReplayAgainstOrdersAsync(new CouponOrderReplayRequest(DiscountValue: 10, Days: 90));
        ninety.TotalGiveaway.Should().Be(10_000m);
        ninety.DaysLookedBack.Should().Be(90);
    }

    [Fact]
    public async Task A_cancelled_order_is_reported_but_not_counted_as_giveaway()
    {
        await AddOrderAsync(100_000m, 0m, DateTime.UtcNow.AddDays(-2), lines: [(_phone, 1, 100_000m)]);
        await AddOrderAsync(100_000m, 0m, DateTime.UtcNow.AddDays(-2), OrderStatus.Cancelled, lines: [(_phone, 1, 100_000m)]);

        var replay = await _coupons.ReplayAgainstOrdersAsync(new CouponOrderReplayRequest(DiscountValue: 10));

        replay.OrdersInWindow.Should().Be(2);
        replay.OrdersQualified.Should().Be(1);
        replay.TotalGiveaway.Should().Be(10_000m);
        replay.Notes.Should().ContainSingle().Which.Should().Contain("1 of those orders were cancelled or rejected");
    }

    [Fact]
    public async Task A_minimum_order_bigger_than_any_past_order_is_said_plainly()
    {
        await AddOrderAsync(100_000m, 0m, DateTime.UtcNow.AddDays(-2), lines: [(_phone, 1, 100_000m)]);

        var replay = await _coupons.ReplayAgainstOrdersAsync(new CouponOrderReplayRequest(
            DiscountValue: 10, MinOrderAmount: 150_000m));

        replay.OrdersQualified.Should().Be(0);
        replay.TotalGiveaway.Should().Be(0m);
        replay.Notes.Should().ContainSingle().Which.Should()
            .Contain("under this coupon's own minimum order of BDT 150,000");
    }

    [Fact]
    public async Task The_replay_shows_what_the_shop_really_gave_away_in_the_same_window()
    {
        await AddOrderAsync(100_000m, 12_000m, DateTime.UtcNow.AddDays(-2), lines: [(_phone, 1, 100_000m)]);

        var replay = await _coupons.ReplayAgainstOrdersAsync(new CouponOrderReplayRequest(DiscountValue: 10));

        replay.ActualGiveawayInWindow.Should().Be(12_000m);
        replay.TotalGiveaway.Should().Be(10_000m);
    }

    // ---------------------------------------------------------------- the second signature

    [Fact]
    public async Task A_coupon_inside_the_threshold_never_enters_the_review()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));

        var created = await CreateAsync("SMALL10", 10);

        created.ApprovalState.Should().Be(CouponApprovalState.NotRequired);
        created.IsActive.Should().BeTrue();
        created.SubmittedByEmail.Should().BeNull();
        (await AuditDetailsAsync(AuditActions.CouponSubmittedForApproval)).Should().BeNull();
    }

    [Fact]
    public async Task A_coupon_over_the_threshold_waits_for_approval_and_cannot_be_used()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));

        var created = await CreateAsync("HUGE30", 30);

        created.IsActive.Should().BeFalse();
        created.ApprovalState.Should().Be(CouponApprovalState.Pending);
        created.SubmittedByEmail.Should().Be("writer@ninecube.demo");

        (await _coupons.GetAvailableCouponsAsync()).Should().BeEmpty();
        (await _coupons.ValidateCouponAsync(new ApplyCouponRequest("HUGE30", 100_000m))).IsValid.Should().BeFalse();

        (await AuditDetailsAsync(AuditActions.CouponSubmittedForApproval))
            .Should().Contain("code=HUGE30").And.Contain("30% off");

        (await StoredAsync(created.Id)).SubmittedByUserId.Should().Be(_writer);
    }

    [Fact]
    public async Task The_administrator_who_wrote_a_coupon_cannot_release_it()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));
        var created = await CreateAsync("HUGE30", 30);

        var act = () => _coupons.ApproveCouponAsync(created.Id);
        await act.Should().ThrowAsync<ResourceConflictException>().WithMessage("*second administrator has to approve it*");

        (await StoredAsync(created.Id)).ApprovalState.Should().Be(CouponApprovalState.Pending);
    }

    [Fact]
    public async Task A_second_administrator_approves_it_and_the_coupon_goes_live()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));
        var created = await CreateAsync("HUGE30", 30);

        AsReviewer();
        var approved = await _coupons.ApproveCouponAsync(created.Id);

        approved.IsActive.Should().BeTrue();
        approved.ApprovalState.Should().Be(CouponApprovalState.Approved);
        approved.SubmittedByEmail.Should().Be("writer@ninecube.demo");
        approved.ReviewedByEmail.Should().Be("reviewer@ninecube.demo");
        approved.ReviewedAt.Should().NotBeNull();

        var audit = await _db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == AuditActions.CouponApproved);
        audit.UserId.Should().Be(_reviewer);
        audit.Details.Should().Contain("approved_by=reviewer@ninecube.demo")
            .And.Contain("submitted_by=writer@ninecube.demo");

        (await _coupons.GetAvailableCouponsAsync()).Select(c => c.Code).Should().BeEquivalentTo(["HUGE30"]);
    }

    [Fact]
    public async Task A_refusal_carries_the_reviewers_words_back_to_the_registry()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));
        var created = await CreateAsync("HUGE30", 30);

        AsReviewer();
        var rejected = await _coupons.RejectCouponAsync(created.Id, new RejectCouponRequest("Too deep for a storewide sale."));

        rejected.IsActive.Should().BeFalse();
        rejected.ApprovalState.Should().Be(CouponApprovalState.Rejected);
        rejected.RejectionReason.Should().Be("Too deep for a storewide sale.");

        (await AuditDetailsAsync(AuditActions.CouponRejected))
            .Should().Contain("refused_by=reviewer@ninecube.demo")
            .And.Contain("Too deep for a storewide sale.");

        // Switching a refused coupon on by hand is refused, and the reason is shown with it — one sentence
        // mark, even though the reviewer already ended theirs with a full stop.
        var act = () => _coupons.ToggleCouponStatusAsync(created.Id, true);
        await act.Should().ThrowAsync<BusinessValidationException>()
            .WithMessage("HUGE30 was refused: Too deep for a storewide sale. Edit it and it goes back for approval.");
    }

    [Fact]
    public async Task A_refusal_needs_a_reason_the_writer_can_act_on()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));
        var created = await CreateAsync("HUGE30", 30);

        AsReviewer();
        var act = () => _coupons.RejectCouponAsync(created.Id, new RejectCouponRequest("no"));
        await act.Should().ThrowAsync<BusinessValidationException>().WithMessage("*Say why in a few words*");
    }

    [Fact]
    public async Task A_coupon_still_waiting_for_approval_cannot_be_switched_on()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));
        var created = await CreateAsync("HUGE30", 30);

        var act = () => _coupons.ToggleCouponStatusAsync(created.Id, true);
        await act.Should().ThrowAsync<BusinessValidationException>()
            .WithMessage("*waiting for a second administrator to approve it*");

        // Switching it off is always allowed, because that spends nothing.
        (await _coupons.ToggleCouponStatusAsync(created.Id, false)).Should().BeTrue();
    }

    [Fact]
    public async Task Editing_an_approved_coupon_back_above_the_threshold_puts_it_on_the_shelf_again()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));
        var created = await CreateAsync("HUGE30", 30);

        AsReviewer();
        await _coupons.ApproveCouponAsync(created.Id);

        _user.UserId = _writer;
        _user.Email = "writer@ninecube.demo";
        var edited = await _coupons.UpdateCouponAsync(created.Id, new UpdateCouponRequest(DiscountValue: 35, MinOrderAmount: 0m));

        edited.ApprovalState.Should().Be(CouponApprovalState.Pending);
        edited.IsActive.Should().BeFalse();
        edited.ReviewedByEmail.Should().BeNull();

        (await StoredAsync(created.Id)).SubmittedByUserId.Should().Be(_writer);
    }

    [Fact]
    public async Task Pulling_a_coupon_back_under_the_threshold_releases_it_without_a_second_signature()
    {
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 0, ApprovalAbovePercentage: 25));
        var created = await CreateAsync("HUGE30", 30);

        var edited = await _coupons.UpdateCouponAsync(created.Id, new UpdateCouponRequest(DiscountValue: 12, MinOrderAmount: 0m));

        edited.ApprovalState.Should().Be(CouponApprovalState.NotRequired);
        edited.IsActive.Should().BeTrue("12% is inside what one administrator may grant alone");

        (await _coupons.GetAvailableCouponsAsync()).Select(c => c.Code).Should().BeEquivalentTo(["HUGE30"]);
    }

    [Fact]
    public async Task Approving_while_the_week_is_over_the_cap_is_refused_too()
    {
        await AddOrderAsync(100_000m, 60_000m, DateTime.UtcNow.AddDays(-1));
        await _policies.SaveAsync(new DiscountPolicy(0, 0, 0, 50_000, ApprovalAbovePercentage: 25));

        // The coupon is written while the cap has room, then the shop overspends.
        var huge = new Coupon
        {
            Code = "WAIT30",
            DiscountType = DiscountType.Percentage,
            DiscountValue = 30,
            ApprovalState = CouponApprovalState.Pending,
            SubmittedByUserId = _writer,
            SubmittedAt = DateTime.UtcNow,
            IsActive = false,
            CreatedAt = DateTime.UtcNow
        };
        _db.Coupons.Add(huge);
        await _db.SaveChangesAsync();

        AsReviewer();
        var act = () => _coupons.ApproveCouponAsync(huge.Id);
        await act.Should().ThrowAsync<BusinessValidationException>().WithMessage("*already used BDT 60,000*");
    }
}
