using NineCube.Domain;

namespace NineCube.Application.Contracts;

// ---------------------------------------------------------------- Password Reset
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Email, string Token, string NewPassword);
public sealed record ForgotPasswordResponse(string Message, string? DemoResetToken = null);

// ---------------------------------------------------------------- Coupons & Discounts
public sealed record CouponDto(
    int Id,
    string Code,
    DiscountType DiscountType,
    decimal DiscountValue,
    decimal MinOrderAmount,
    DateTime? ExpiresAt,
    int? UsageLimit,
    int UsageCount,
    bool IsActive,
    decimal? MaxDiscountCap = null,
    CouponTargetType TargetType = CouponTargetType.Order,
    int? TargetId = null,
    DateTime? StartsAt = null,
    bool IsAutomatic = false,
    string? CampaignTitle = null,
    bool IsBannerPromoted = false);

public sealed record CreateCouponRequest(
    string Code,
    DiscountType DiscountType,
    decimal DiscountValue,
    decimal MinOrderAmount,
    DateTime? ExpiresAt = null,
    int? UsageLimit = null,
    decimal? MaxDiscountCap = null,
    CouponTargetType TargetType = CouponTargetType.Order,
    int? TargetId = null,
    DateTime? StartsAt = null,
    bool IsAutomatic = false,
    string? CampaignTitle = null,
    bool IsBannerPromoted = false);

public sealed record CartLineItemDto(int ProductId, int Quantity, decimal UnitPrice, int? CategoryId = null, int? BrandId = null);

public sealed record ApplyCouponRequest(string Code, decimal SubTotal, IReadOnlyList<CartLineItemDto>? Items = null);

public sealed record CouponValidationResult(
    bool IsValid,
    string? Reason,
    decimal DiscountAmount,
    string? Code,
    string? CampaignTitle = null,
    CouponTargetType TargetType = CouponTargetType.Order,
    decimal? MaxDiscountCap = null);

// ---------------------------------------------------------------- Payments
public sealed record ProcessPaymentRequest(int OrderId, PaymentMethod Provider);
public sealed record PaymentCallbackRequest(int OrderId, string TransactionReference, bool Success, string? ProviderPayload);

public sealed record PaymentTransactionDto(
    int Id,
    int OrderId,
    decimal Amount,
    string Currency,
    PaymentMethod Provider,
    string TransactionReference,
    PaymentStatus Status,
    DateTime CreatedAt);

// ---------------------------------------------------------------- Reviews
public sealed record CreateReviewRequest(int Rating, string? Comment);

public sealed record ProductReviewDto(
    int Id,
    int ProductId,
    int CustomerId,
    string CustomerName,
    int Rating,
    string? Comment,
    bool IsVerifiedBuyer,
    DateTime CreatedAt);

public sealed record ProductRatingSummaryDto(
    decimal AverageRating,
    int TotalReviews,
    IReadOnlyList<ProductReviewDto> RecentReviews);

// ---------------------------------------------------------------- Wishlist
public sealed record WishlistItemDto(
    int Id,
    int ProductId,
    string ProductName,
    string Sku,
    decimal Price,
    string? ImageUrl,
    bool InStock,
    DateTime AddedAt);


// ---------------------------------------------------------------- Gift Cards
public sealed record GiftCardDto(
    int Id,
    string Code,
    decimal InitialBalance,
    decimal CurrentBalance,
    string Currency,
    string? RecipientEmail,
    string? RecipientName,
    string? Note,
    bool IsActive,
    DateTime? ExpiresAt,
    DateTime CreatedAt,
    DateTime? LastUsedAt);

public sealed record CreateGiftCardRequest(
    decimal InitialBalance,
    string? Code = null,
    string? RecipientEmail = null,
    string? RecipientName = null,
    string? Note = null,
    DateTime? ExpiresAt = null);

public sealed record AdjustGiftCardBalanceRequest(
    decimal NewBalance,
    string? Reason = null);

public sealed record ValidateGiftCardRequest(
    string Code);

public sealed record ValidateGiftCardResponse(
    bool IsValid,
    string? Code,
    decimal CurrentBalance,
    string Currency,
    string? RecipientName,
    string? Reason);
