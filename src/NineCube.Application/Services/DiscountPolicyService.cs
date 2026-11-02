using System.Globalization;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>
/// The store's own limits on discounting. They live in the Setting table like the low stock threshold, so
/// an Administrator can change them at runtime without a deployment, and a shop that sets nothing keeps
/// the old unrestricted behaviour.
/// </summary>
public interface IDiscountPolicyService
{
    Task<DiscountPolicy> GetAsync(CancellationToken ct = default);

    Task<DiscountPolicyView> GetViewAsync(CancellationToken ct = default);

    Task<DiscountPolicy> SaveAsync(DiscountPolicy policy, CancellationToken ct = default);

    /// <summary>Throws with the plain sentence that refuses this coupon, or returns when the policy allows it.</summary>
    Task GuardCouponAsync(
        DiscountType type,
        decimal discountValue,
        decimal? maxDiscountCap,
        decimal minOrderAmount,
        CancellationToken ct = default);

    /// <summary>Refuses to let another campaign go live while the week's giveaway is already over the cap.</summary>
    Task GuardNewCampaignAsync(CancellationToken ct = default);

    /// <summary>True when this coupon is big enough that a second administrator has to sign it off.</summary>
    Task<bool> NeedsApprovalAsync(
        DiscountType type,
        decimal discountValue,
        decimal? maxDiscountCap,
        CancellationToken ct = default);

    /// <summary>The discounts actually written off on orders that still stand, over the trailing window.</summary>
    Task<decimal> PromoSpendAsync(int days, CancellationToken ct = default);
}

public sealed class DiscountPolicyService : IDiscountPolicyService
{
    private const string CacheKey = "settings:discount_policy";
    private const decimal MaxTaka = 100_000_000m;

    private static readonly Dictionary<string, Func<DiscountPolicy, decimal>> ReadKey = new()
    {
        [SettingKeys.MaxPercentageOff] = p => p.MaxPercentageOff,
        [SettingKeys.MaxAmountPerOrder] = p => p.MaxAmountPerOrder,
        [SettingKeys.MaxShareOfOrder] = p => p.MaxShareOfOrder,
        [SettingKeys.WeeklySpendCap] = p => p.WeeklySpendCap,
        [SettingKeys.ApprovalAbovePercentage] = p => p.ApprovalAbovePercentage,
        [SettingKeys.ApprovalAboveAmount] = p => p.ApprovalAboveAmount
    };

    private readonly IAppDbContext _db;
    private readonly ICacheService _cache;
    private readonly IAuditWriter _audit;
    private readonly IClock _clock;

    public DiscountPolicyService(IAppDbContext db, ICacheService cache, IAuditWriter audit, IClock clock)
    {
        _db = db;
        _cache = cache;
        _audit = audit;
        _clock = clock;
    }

    public Task<DiscountPolicy> GetAsync(CancellationToken ct = default) =>
        _cache.GetOrCreateAsync(CacheKey, LoadAsync, TimeSpan.FromMinutes(10), ct);

    public async Task<DiscountPolicyView> GetViewAsync(CancellationToken ct = default)
    {
        var policy = await GetAsync(ct);
        return new DiscountPolicyView(policy, await PromoSpendAsync(7, ct));
    }

    public async Task<DiscountPolicy> SaveAsync(DiscountPolicy policy, CancellationToken ct = default)
    {
        Validate(policy);

        var keys = ReadKey.Keys.ToList();
        var rows = await _db.Settings
            .Where(s => keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, ct);

        var changes = new List<string>();
        foreach (var (key, read) in ReadKey)
        {
            var value = Format(read(policy));
            if (rows.TryGetValue(key, out var existing))
            {
                if (existing.Value == value) continue;
                changes.Add($"{key}: {existing.Value} -> {value}");
                existing.Value = value;
            }
            else
            {
                if (value == "0") continue;
                changes.Add($"{key}: (unset) -> {value}");
                _db.Settings.Add(new Setting { Key = key, Value = value });
            }
        }

        if (changes.Count == 0) return await GetAsync(ct);

        await _db.SaveChangesAsync(ct);
        _cache.Remove(CacheKey);
        await _audit.WriteAsync(
            AuditActions.DiscountPolicyUpdated,
            nameof(Setting),
            nameof(DiscountPolicy),
            string.Join(", ", changes),
            ct);

        return await GetAsync(ct);
    }

    public async Task GuardCouponAsync(
        DiscountType type,
        decimal discountValue,
        decimal? maxDiscountCap,
        decimal minOrderAmount,
        CancellationToken ct = default)
    {
        var refusal = DiscountPolicyGuard.RefusalFor(await GetAsync(ct), type, discountValue, maxDiscountCap, minOrderAmount);
        if (refusal is not null) throw new BusinessValidationException(refusal);
    }

    public async Task GuardNewCampaignAsync(CancellationToken ct = default)
    {
        var policy = await GetAsync(ct);
        if (policy.WeeklySpendCap <= 0) return;

        var spent = await PromoSpendAsync(7, ct);
        if (spent < policy.WeeklySpendCap) return;

        throw new BusinessValidationException(
            $"Orders in the last 7 days already used {DiscountPolicyGuard.Taka(spent)} of discounts, and your policy " +
            $"allows {DiscountPolicyGuard.Taka(policy.WeeklySpendCap)} a week. No campaign can go live until that " +
            $"figure falls under the cap, so an older day drops out of the window.");
    }

    public async Task<bool> NeedsApprovalAsync(
        DiscountType type,
        decimal discountValue,
        decimal? maxDiscountCap,
        CancellationToken ct = default) =>
        DiscountPolicyGuard.NeedsApproval(await GetAsync(ct), type, discountValue, maxDiscountCap);

    public async Task<decimal> PromoSpendAsync(int days, CancellationToken ct = default)
    {
        var since = _clock.UtcNow.AddDays(-days);

        return await _db.Orders.AsNoTracking()
            .Where(o => o.CreatedAt >= since && o.Status != OrderStatus.Cancelled && o.Status != OrderStatus.Rejected)
            .SumAsync(o => o.DiscountAmount, ct);
    }

    private async Task<DiscountPolicy> LoadAsync(CancellationToken ct)
    {
        var keys = ReadKey.Keys.ToList();
        var rows = await _db.Settings.AsNoTracking()
            .Where(s => keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        decimal Of(string key) =>
            rows.TryGetValue(key, out var raw) && decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) && value >= 0
                ? value
                : 0m;

        return new DiscountPolicy(Of(SettingKeys.MaxPercentageOff), Of(SettingKeys.MaxAmountPerOrder),
            Of(SettingKeys.MaxShareOfOrder), Of(SettingKeys.WeeklySpendCap),
            Of(SettingKeys.ApprovalAbovePercentage), Of(SettingKeys.ApprovalAboveAmount));
    }

    private static void Validate(DiscountPolicy policy)
    {
        RequireRange(policy.MaxPercentageOff, 100m, "Maximum discount rate");
        RequireRange(policy.MaxShareOfOrder, 100m, "Maximum share of one order");
        RequireRange(policy.ApprovalAbovePercentage, 100m, "Approval threshold rate");
        RequireRange(policy.MaxAmountPerOrder, MaxTaka, "Maximum discount per order");
        RequireRange(policy.WeeklySpendCap, MaxTaka, "Weekly promo spend cap");
        RequireRange(policy.ApprovalAboveAmount, MaxTaka, "Approval threshold amount");

        // A threshold above the refusal limit could never be reached, which would look like a rule that ignores coupons.
        if (policy.ApprovalAbovePercentage > 0 && policy.MaxPercentageOff > 0 && policy.ApprovalAbovePercentage > policy.MaxPercentageOff)
        {
            throw new BusinessValidationException(
                $"The approval threshold of {DiscountPolicyGuard.Pct(policy.ApprovalAbovePercentage)} is above the maximum " +
                $"rate of {DiscountPolicyGuard.Pct(policy.MaxPercentageOff)}, so no coupon could ever reach it. " +
                "Set the threshold at or below the maximum.");
        }

        if (policy.ApprovalAboveAmount > 0 && policy.MaxAmountPerOrder > 0 && policy.ApprovalAboveAmount > policy.MaxAmountPerOrder)
        {
            throw new BusinessValidationException(
                $"The approval threshold of {DiscountPolicyGuard.Taka(policy.ApprovalAboveAmount)} is above the maximum " +
                $"discount of {DiscountPolicyGuard.Taka(policy.MaxAmountPerOrder)}, so no coupon could ever reach it. " +
                "Set the threshold at or below the maximum.");
        }
    }

    private static void RequireRange(decimal value, decimal upper, string label)
    {
        if (value < 0) throw new BusinessValidationException($"{label} cannot be negative. Use 0 to switch the rule off.");
        if (value > upper) throw new BusinessValidationException($"{label} must be {Format(upper)} or less.");
    }

    private static string Format(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);
}
