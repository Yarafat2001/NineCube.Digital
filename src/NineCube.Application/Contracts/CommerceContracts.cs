using NineCube.Domain;

namespace NineCube.Application.Contracts;

// ---------------------------------------------------------------- Password Reset
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Email, string Token, string NewPassword);
public sealed record ForgotPasswordResponse(string Message, string? DemoResetToken = null);

// ---------------------------------------------------------------- Coupons & Discounts

/// <summary>One catalogue test written by the operator: an attribute, whether it admits or excludes, and the ids.</summary>
public sealed record CouponScopeRuleDto(
    ScopeAttribute Attribute,
    ScopePolarity Polarity,
    IReadOnlyList<int> EntityIds);

/// <summary>A stored rule with the catalogue names resolved, so the registry can print the scope without extra queries.</summary>
public sealed record CouponScopeRuleView(
    ScopeAttribute Attribute,
    ScopePolarity Polarity,
    IReadOnlyList<int> EntityIds,
    IReadOnlyList<string> EntityNames);

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
    bool IsBannerPromoted = false,
    decimal MinEligibleAmount = 0,
    ScopeMatch ScopeMatch = ScopeMatch.Any,
    DiscountExclusivity Exclusivity = DiscountExclusivity.BestOnly,
    IReadOnlyList<CouponScopeRuleView>? ScopeRules = null);

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
    bool IsBannerPromoted = false,
    decimal MinEligibleAmount = 0,
    ScopeMatch ScopeMatch = ScopeMatch.Any,
    DiscountExclusivity Exclusivity = DiscountExclusivity.BestOnly,
    IReadOnlyList<CouponScopeRuleDto>? ScopeRules = null);

public sealed record CartLineItemDto(int ProductId, int Quantity, decimal UnitPrice, int? CategoryId = null, int? BrandId = null);

public sealed record ApplyCouponRequest(string Code, decimal SubTotal, IReadOnlyList<CartLineItemDto>? Items = null);

public sealed record CouponValidationResult(
    bool IsValid,
    string? Reason,
    decimal DiscountAmount,
    string? Code,
    string? CampaignTitle = null,
    CouponTargetType TargetType = CouponTargetType.Order,
    decimal? MaxDiscountCap = null,
    decimal EligibleAmount = 0,
    string? ScopeSummary = null,
    DiscountExclusivity Exclusivity = DiscountExclusivity.BestOnly);

public sealed record EvaluateCartPromotionsRequest(
    decimal SubTotal,
    IReadOnlyList<CartLineItemDto>? Items = null,
    string? ManualCouponCode = null);

public sealed record CartPromotionsEvaluationResult(
    CouponValidationResult? AutomaticDiscount,
    CouponValidationResult? ManualDiscount,
    CouponValidationResult? EffectiveDiscount,
    decimal TotalDiscountAmount,
    string? ActiveCampaignHeadline,
    decimal FreeShippingThreshold,
    bool QualifiesForFreeShipping,
    decimal AmountNeededForFreeShipping,
    IReadOnlyList<CouponValidationResult>? AppliedDiscounts = null);

/// <summary>The scope exactly as the builder holds it, before anything is saved.</summary>
public sealed record CouponScopePreviewRequest(
    IReadOnlyList<CouponScopeRuleDto>? ScopeRules = null,
    ScopeMatch ScopeMatch = ScopeMatch.Any,
    CouponTargetType TargetType = CouponTargetType.Order,
    int? TargetId = null,
    DiscountType DiscountType = DiscountType.Percentage,
    decimal DiscountValue = 0,
    decimal? MaxDiscountCap = null,
    decimal MinEligibleAmount = 0);

public sealed record ScopeConflictDto(
    string Code,
    string? CampaignTitle,
    int OverlappingProducts,
    bool IsAutomatic);

/// <summary>What the forecast is measured against, so the UI can label the number honestly.</summary>
public enum PreviewValueBasis
{
    /// <summary>A real average order subtotal.</summary>
    OrderHistory = 0,
    /// <summary>No orders yet, so a single average-priced qualifying product is used instead.</summary>
    AverageProductPrice = 1,
    /// <summary>The scope reaches nothing, so no amount can be estimated.</summary>
    NotEstimated = 2
}

public sealed record CouponScopePreviewResult(
    int TotalActiveProducts,
    int MatchedProducts,
    int MatchedUnits,
    decimal ExposedStockValue,
    decimal AverageQualifyingValue,
    PreviewValueBasis ValueBasis,
    decimal ForecastDiscount,
    IReadOnlyList<string> SampleProducts,
    IReadOnlyList<ScopeConflictDto> Conflicts);


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

/// <summary>
/// A coupon edit. The scope fields are nullable because an absent value means "keep what is stored" —
/// a dialog that only edits the discount must never be able to reset a scoped coupon to storewide.
/// </summary>
public sealed record UpdateCouponRequest(
    decimal DiscountValue,
    decimal MinOrderAmount,
    DateTime? ExpiresAt = null,
    int? UsageLimit = null,
    decimal? MaxDiscountCap = null,
    CouponTargetType? TargetType = null,
    int? TargetId = null,
    DateTime? StartsAt = null,
    bool IsAutomatic = false,
    string? CampaignTitle = null,
    bool IsBannerPromoted = false,
    decimal? MinEligibleAmount = null,
    ScopeMatch? ScopeMatch = null,
    DiscountExclusivity? Exclusivity = null,
    IReadOnlyList<CouponScopeRuleDto>? ScopeRules = null);

public sealed record UpdateGiftCardRequest(
    string? RecipientEmail = null,
    string? RecipientName = null,
    string? Note = null,
    DateTime? ExpiresAt = null);
