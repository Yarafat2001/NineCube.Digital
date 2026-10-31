using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface ICouponService
{
    Task<CouponValidationResult> ValidateCouponAsync(ApplyCouponRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<CouponDto>> ListCouponsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<CouponDto>> GetActiveCampaignBannersAsync(CancellationToken ct = default);
    Task<CouponDto> CreateCouponAsync(CreateCouponRequest request, CancellationToken ct = default);
    Task<bool> ToggleCouponStatusAsync(int id, bool isActive, CancellationToken ct = default);
    Task ConsumeCouponAsync(string code, CancellationToken ct = default);
}

public sealed class CouponService : ICouponService
{
    private readonly IAppDbContext _db;
    private readonly IClock _clock;

    public CouponService(IAppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<CouponValidationResult> ValidateCouponAsync(ApplyCouponRequest request, CancellationToken ct = default)
    {
        var code = request.Code.Trim().ToUpperInvariant();
        var coupon = await _db.Coupons.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Code == code, ct);

        if (coupon is null || !coupon.IsActive)
        {
            return new CouponValidationResult(false, "Coupon code is invalid or no longer active.", 0, null);
        }

        var now = _clock.UtcNow;
        if (coupon.StartsAt.HasValue && coupon.StartsAt.Value > now)
        {
            return new CouponValidationResult(false, "This promotional campaign has not started yet.", 0, null);
        }

        if (coupon.ExpiresAt.HasValue && coupon.ExpiresAt.Value < now)
        {
            return new CouponValidationResult(false, "Coupon has expired.", 0, null);
        }

        if (coupon.UsageLimit.HasValue && coupon.UsageCount >= coupon.UsageLimit.Value)
        {
            return new CouponValidationResult(false, "Coupon usage limit has been reached.", 0, null);
        }

        if (request.SubTotal < coupon.MinOrderAmount)
        {
            return new CouponValidationResult(
                false,
                $"Minimum order amount of {coupon.MinOrderAmount:0.00} required to apply this coupon.",
                0,
                null);
        }

        // Determine eligible base amount based on target scope (Order, Category, Brand, Product)
        decimal eligibleAmount = request.SubTotal;
        if (coupon.TargetType != CouponTargetType.Order && coupon.TargetId.HasValue && request.Items != null && request.Items.Count > 0)
        {
            var targetId = coupon.TargetId.Value;
            var eligibleItems = coupon.TargetType switch
            {
                CouponTargetType.Product => request.Items.Where(i => i.ProductId == targetId),
                CouponTargetType.Category => request.Items.Where(i => i.CategoryId == targetId),
                CouponTargetType.Brand => request.Items.Where(i => i.BrandId == targetId),
                _ => request.Items
            };

            eligibleAmount = eligibleItems.Sum(i => i.Quantity * i.UnitPrice);
            if (eligibleAmount <= 0)
            {
                var scopeName = coupon.TargetType.ToString().ToLowerInvariant();
                return new CouponValidationResult(false, $"This coupon is only valid for qualifying {scopeName} items.", 0, null);
            }
        }

        decimal discount = coupon.DiscountType switch
        {
            DiscountType.Percentage => decimal.Round(eligibleAmount * (coupon.DiscountValue / 100m), 2, MidpointRounding.AwayFromZero),
            DiscountType.FixedAmount => Math.Min(eligibleAmount, coupon.DiscountValue),
            _ => 0
        };

        // Apply Max Discount Cap if specified
        if (coupon.MaxDiscountCap.HasValue && coupon.MaxDiscountCap.Value > 0)
        {
            discount = Math.Min(discount, coupon.MaxDiscountCap.Value);
        }

        // Discount cannot exceed subtotal
        discount = Math.Min(discount, request.SubTotal);

        return new CouponValidationResult(
            true,
            null,
            discount,
            coupon.Code,
            coupon.CampaignTitle,
            coupon.TargetType,
            coupon.MaxDiscountCap);
    }

    public async Task ConsumeCouponAsync(string code, CancellationToken ct = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        await _db.Coupons
            .Where(c => c.Code == normalized)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsageCount, c => c.UsageCount + 1), ct);
    }

    public async Task<IReadOnlyList<CouponDto>> ListCouponsAsync(CancellationToken ct = default)
    {
        var coupons = await _db.Coupons.AsNoTracking()
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new CouponDto(
                c.Id,
                c.Code,
                c.DiscountType,
                c.DiscountValue,
                c.MinOrderAmount,
                c.ExpiresAt,
                c.UsageLimit,
                c.UsageCount,
                c.IsActive,
                c.MaxDiscountCap,
                c.TargetType,
                c.TargetId,
                c.StartsAt,
                c.IsAutomatic,
                c.CampaignTitle,
                c.IsBannerPromoted))
            .ToListAsync(ct);

        return coupons;
    }

    public async Task<IReadOnlyList<CouponDto>> GetActiveCampaignBannersAsync(CancellationToken ct = default)
    {
        var now = _clock.UtcNow;
        return await _db.Coupons.AsNoTracking()
            .Where(c => c.IsActive && c.IsBannerPromoted && (!c.ExpiresAt.HasValue || c.ExpiresAt.Value > now) && (!c.StartsAt.HasValue || c.StartsAt.Value <= now))
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new CouponDto(
                c.Id,
                c.Code,
                c.DiscountType,
                c.DiscountValue,
                c.MinOrderAmount,
                c.ExpiresAt,
                c.UsageLimit,
                c.UsageCount,
                c.IsActive,
                c.MaxDiscountCap,
                c.TargetType,
                c.TargetId,
                c.StartsAt,
                c.IsAutomatic,
                c.CampaignTitle,
                c.IsBannerPromoted))
            .ToListAsync(ct);
    }

    public async Task<CouponDto> CreateCouponAsync(CreateCouponRequest request, CancellationToken ct = default)
    {
        var code = request.Code.Trim().ToUpperInvariant();
        if (await _db.Coupons.AnyAsync(c => c.Code == code, ct))
        {
            throw new ResourceConflictException($"Coupon with code '{code}' already exists.", "duplicate_coupon");
        }

        var coupon = new Coupon
        {
            Code = code,
            DiscountType = request.DiscountType,
            DiscountValue = request.DiscountValue,
            MinOrderAmount = request.MinOrderAmount,
            MaxDiscountCap = request.MaxDiscountCap,
            TargetType = request.TargetType,
            TargetId = request.TargetId,
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

        return new CouponDto(
            coupon.Id,
            coupon.Code,
            coupon.DiscountType,
            coupon.DiscountValue,
            coupon.MinOrderAmount,
            coupon.ExpiresAt,
            coupon.UsageLimit,
            coupon.UsageCount,
            coupon.IsActive,
            coupon.MaxDiscountCap,
            coupon.TargetType,
            coupon.TargetId,
            coupon.StartsAt,
            coupon.IsAutomatic,
            coupon.CampaignTitle,
            coupon.IsBannerPromoted);
    }

    public async Task<bool> ToggleCouponStatusAsync(int id, bool isActive, CancellationToken ct = default)
    {
        var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException($"Coupon {id} was not found.");

        coupon.IsActive = isActive;
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
