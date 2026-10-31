using NineCube.Domain;

namespace NineCube.Application.Contracts;

// ---------------------------------------------------------------- shared

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasNext => Page < TotalPages;
    public bool HasPrevious => Page > 1;
}

// ---------------------------------------------------------------- auth

public sealed record RegisterRequest(string Email, string Password, string Name);
public sealed record LoginRequest(string Email, string Password);

public sealed record UserSummaryDto(int Id, string Email, UserRole Role, int? CustomerId);

public sealed record AuthResponse(string AccessToken, DateTime ExpiresAtUtc, UserSummaryDto User, string? RefreshToken = null);
public sealed record RefreshTokenRequest(string RefreshToken);

// ---------------------------------------------------------------- catalog

public sealed record ProductImageDto(int Id, string Url, bool IsPrimary, string? AltText);

public sealed record ProductDto(
    int Id,
    string Sku,
    string Name,
    decimal Price,
    int StockQuantity,
    bool IsActive,
    string? RowVersion,
    string? Description = null,
    string? ImageUrl = null,
    IReadOnlyList<ProductCategoryDto>? Categories = null,
    IReadOnlyList<string>? Tags = null,
    string Currency = "BDT", string? Slug = null, bool NeedsReview = false,
    string? SourceName = null, string? SourceUrl = null, string? PriceBasis = null, DateTime? PriceVerifiedAt = null,
    int? BrandId = null, string? BrandName = null, string? BrandSlug = null,
    int? ProductLineId = null, string? ProductLineName = null, string? ProductLineSlug = null,
    IReadOnlyList<ProductImageDto>? Images = null,
    decimal? CompareAtPrice = null);

/// <summary>Upload metadata echoed back after a product image is stored.</summary>
public sealed record ProductImageUploadRequest(string Url, bool SetAsPrimary = true, string? AltText = null);

public sealed record CreateProductRequest(string Sku, string Name, decimal Price, bool IsActive = true,
    string? Description = null, string? ImageUrl = null, int? BrandId = null, int? ProductLineId = null, decimal? CompareAtPrice = null);
public sealed record UpdateProductRequest(string Name, decimal Price, bool IsActive, string? Description = null,
    string? ImageUrl = null, int? BrandId = null, int? ProductLineId = null, decimal? CompareAtPrice = null);
public sealed record StockAdjustmentRequest(int Delta, string Reason);

public sealed record InventoryMovementDto(
    int Id,
    int ProductId,
    int? OrderId,
    int Delta,
    string Reason,
    int? CreatedByUserId,
    string? CreatedByEmail,
    DateTime CreatedAt);

// ---------------------------------------------------------------- orders

public sealed record OrderLineRequest(int ProductId, int Quantity);

public sealed record CreateOrderRequest(IReadOnlyList<OrderLineRequest> Items, string? CouponCode = null, PaymentMethod PaymentMethod = PaymentMethod.CashOnDelivery, string? GiftCardCode = null);

public sealed record OrderItemDto(
    int Id,
    int ProductId,
    string Sku,
    string Name,
    int Quantity,
    decimal UnitPrice,
    decimal LineTotal,
    string? PrimaryCategoryName = null);

public sealed record OrderDto(
    int Id,
    int CustomerId,
    string? CustomerName,
    OrderStatus Status,
    decimal TotalAmount,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string? IdempotencyKey,
    IReadOnlyList<OrderItemDto> Items,
    string Currency = "BDT",
    decimal SubTotal = 0,
    decimal DiscountAmount = 0,
    string? CouponCode = null,
    string? GiftCardCode = null,
    decimal GiftCardAmount = 0,
    decimal ShippingAmount = 0,
    PaymentStatus PaymentStatus = PaymentStatus.Unpaid,
    PaymentMethod PaymentMethod = PaymentMethod.CashOnDelivery,
    string? TrackingNumber = null,
    string? Carrier = null);

public sealed record InvoiceDto(
    int OrderId,
    DateTime OrderDate,
    string Status,
    string CustomerName,
    string CustomerEmail,
    IReadOnlyList<OrderItemDto> Lines,
    decimal Subtotal,
    decimal Total,
    string Currency = "BDT");

// ---------------------------------------------------------------- reports

public sealed record SalesByStatusDto(string Status, int OrderCount, decimal Revenue, decimal Percentage);

public sealed record SalesSummaryDto(
    DateTime From,
    DateTime To,
    int TotalOrders,
    decimal TotalRevenue,
    IReadOnlyList<SalesByStatusDto> ByStatus,
    string Currency = "BDT");

// ---------------------------------------------------------------- admin

public sealed record AdminUserDto(
    int Id,
    string Email,
    UserRole Role,
    bool IsActive,
    int? CustomerId,
    DateTime CreatedAt);

public sealed record CreateUserRequest(string Email, string Password, UserRole Role, string? Name);

public sealed record ChangeUserRoleRequest(UserRole Role);
public sealed record SetUserActiveRequest(bool IsActive);

public sealed record AuditLogDto(
    int Id,
    int? UserId,
    string? UserEmail,
    string Action,
    string EntityType,
    string? EntityId,
    DateTime CreatedAt,
    string? Details);

public sealed record SettingsDto(int LowStockThreshold);
