using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface ICouponService
{
    Task<CouponValidationResult> ValidateCouponAsync(ApplyCouponRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<CouponDto>> ListCouponsAsync(CancellationToken ct = default);
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

        if (coupon.ExpiresAt.HasValue && coupon.ExpiresAt.Value < _clock.UtcNow)
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

        decimal discount = coupon.DiscountType switch
        {
            DiscountType.Percentage => decimal.Round(request.SubTotal * (coupon.DiscountValue / 100m), 2, MidpointRounding.AwayFromZero),
            DiscountType.FixedAmount => coupon.DiscountValue,
            _ => 0
        };

        // Discount cannot exceed subtotal
        discount = Math.Min(discount, request.SubTotal);

        return new CouponValidationResult(true, null, discount, coupon.Code);
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
                c.IsActive))
            .ToListAsync(ct);

        return coupons;
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
            ExpiresAt = request.ExpiresAt,
            UsageLimit = request.UsageLimit,
            UsageCount = 0,
            IsActive = true,
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
            coupon.IsActive);
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
