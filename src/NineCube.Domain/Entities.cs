namespace NineCube.Domain;

public sealed class Product
{
    public string Slug { get; set; } = string.Empty;
    public string Currency { get; set; } = "BDT";
    public string? SourceName { get; set; }
    public string? SourceUrl { get; set; }
    public string? SourceLicense { get; set; }
    public string? SpecsJson { get; set; }
    public bool NeedsReview { get; set; }
    public string? PriceBasis { get; set; }
    public DateTime? PriceVerifiedAt { get; set; }
    public List<ProductCategory> Categories { get; set; } = new();
    public List<ProductTag> Tags { get; set; } = new();
    public List<ProductImage> Images { get; set; } = new();
    public List<ProductReview> Reviews { get; set; } = new();
    public int Id { get; set; }
    public string Sku { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    /// <summary>Brand of this product, when the catalogue data identifies one. Never guessed.</summary>
    public int? BrandId { get; set; }
    public Brand? Brand { get; set; }
    /// <summary>Series within the brand (always a line of BrandId, enforced in the API layer).</summary>
    public int? ProductLineId { get; set; }
    public ProductLine? ProductLine { get; set; }
    /// <summary>decimal(18,2). Never a floating point type for money.</summary>
    public decimal Price { get; set; }
    public int StockQuantity { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>SQL Server rowversion. Not used for the stock reservation (we use atomic conditional
    /// updates) but retained for optimistic concurrency on product edits.</summary>
    public byte[]? RowVersion { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    /// <summary>Optional contact number. Kept separate from the login email because the login
    /// identity is not editable from the profile page.</summary>
    public string? Phone { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<Order> Orders { get; set; } = new();
    public List<Address> Addresses { get; set; } = new();
    public List<WishlistItem> Wishlist { get; set; } = new();
    public List<ProductReview> Reviews { get; set; } = new();
}

/// <summary>
/// A saved delivery address. Bangladesh has no postal-code culture worth enforcing here, so the
/// geography is division / district / upazila, which is what the couriers actually ask for.
/// </summary>
public sealed class Address
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string Label { get; set; } = string.Empty;
    public string Division { get; set; } = string.Empty;
    public string District { get; set; } = string.Empty;
    public string Upazila { get; set; } = string.Empty;
    public string AddressLine { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>Only set for the Customer role; links the login to the billing identity.</summary>
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class Order
{
    public string Currency { get; set; } = "BDT";
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public decimal TotalAmount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    /// <summary>Client supplied key, unique per customer. Makes POST /orders retry-safe.</summary>
    public string? IdempotencyKey { get; set; }
    public List<OrderItem> Items { get; set; } = new();
    public decimal SubTotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public string? CouponCode { get; set; }
    public decimal ShippingAmount { get; set; }
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Unpaid;
    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.CashOnDelivery;
    public string? TrackingNumber { get; set; }
    public string? Carrier { get; set; }
    public List<PaymentTransaction> PaymentTransactions { get; set; } = new();
}

public sealed class OrderItem
{
    public string ProductName { get; set; } = "";
    public string PrimaryCategoryName { get; set; } = "Uncategorized";
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int Quantity { get; set; }
    /// <summary>Price snapshot taken server side at placement time.</summary>
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
}

/// <summary>
/// Append only ledger of every stock movement. Stock is only ever changed through the
/// atomic conditional updates, and each of those writes exactly one row here, so
/// opening stock + SUM(Delta) always equals the current stock.
/// </summary>
public sealed class InventoryMovement
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int? OrderId { get; set; }
    public Order? Order { get; set; }
    public int Delta { get; set; }
    public string Reason { get; set; } = string.Empty;
    public int? CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class AuditLog
{
    public int Id { get; set; }
    public int? UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? Details { get; set; }
}

public sealed class Setting
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

/// <summary>
/// In-app notification for one user. Written in the same transaction as the event that caused
/// it, so a confirmed order always has its notification and a rolled back order never does.
/// </summary>
public sealed class Notification
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public NotificationType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    /// <summary>Client-side route the notification points at, e.g. "/account/orders/12".</summary>
    public string? Link { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadAt { get; set; }
}


public sealed class Coupon
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public DiscountType DiscountType { get; set; }
    public decimal DiscountValue { get; set; }
    public decimal MinOrderAmount { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public int? UsageLimit { get; set; }
    public int UsageCount { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

public sealed class PaymentTransaction
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "BDT";
    public PaymentMethod Provider { get; set; }
    public string TransactionReference { get; set; } = string.Empty;
    public PaymentStatus Status { get; set; }
    public string? ProviderPayload { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class PasswordResetToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? UsedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class ProductReview
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public int Rating { get; set; }
    public string? Comment { get; set; }
    public bool IsVerifiedBuyer { get; set; }
    public bool IsApproved { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

public sealed class WishlistItem
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public DateTime CreatedAt { get; set; }
}
