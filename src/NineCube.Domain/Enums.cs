namespace NineCube.Domain;

/// <summary>
/// The four roles of the system. Deliberately small: a small/medium retail business
/// does not gain anything from splitting Finance / Delivery / Marketing out of these.
/// </summary>
public enum UserRole
{
    Customer = 0,
    Staff = 1,
    InventoryManager = 2,
    Administrator = 3
}

/// <summary>
/// What a notification is about. Stored as a string so a new kind can be added without
/// renumbering the ones clients already branch on.
/// </summary>
public enum NotificationType
{
    OrderPlaced = 0,
    OrderStatusChanged = 1,
    OrderCancelled = 2,
    NewOrder = 3,
    LowStock = 4
}

/// <summary>
/// Order lifecycle.
/// Pending -> Confirmed -> Shipped
/// Pending -> Rejected
/// Pending | Confirmed -> Cancelled
/// </summary>
public enum OrderStatus
{
    Pending = 0,
    Confirmed = 1,
    Shipped = 2,
    Rejected = 3,
    Cancelled = 4,
    Delivered = 5,
    DeliveryFailed = 6
}

/// <summary>
/// Single source of truth for legal order status transitions. Both the API and the
/// tests use this so the rule can never drift between the two.
/// </summary>
public static class OrderStatusRules
{
    public static readonly IReadOnlyDictionary<OrderStatus, OrderStatus[]> Allowed =
        new Dictionary<OrderStatus, OrderStatus[]>
        {
            [OrderStatus.Pending] = new[] { OrderStatus.Confirmed, OrderStatus.Rejected, OrderStatus.Cancelled },
            [OrderStatus.Confirmed] = new[] { OrderStatus.Shipped, OrderStatus.Cancelled },
            [OrderStatus.Shipped] = new[] { OrderStatus.Delivered, OrderStatus.DeliveryFailed },
            [OrderStatus.Delivered] = Array.Empty<OrderStatus>(),
            [OrderStatus.DeliveryFailed] = new[] { OrderStatus.Shipped },
            [OrderStatus.Rejected] = Array.Empty<OrderStatus>(),
            [OrderStatus.Cancelled] = Array.Empty<OrderStatus>()
        };

    /// <summary>Terminal statuses release (or have already released) the stock reservation.</summary>
    public static bool ReservationsReleased(OrderStatus status) =>
        status is OrderStatus.Cancelled or OrderStatus.Rejected;

    public static bool CanTransition(OrderStatus from, OrderStatus to) =>
        Allowed.TryGetValue(from, out var targets) && targets.Contains(to);

    /// <summary>Statuses a customer is allowed to cancel from.</summary>
    public static bool IsCustomerCancellable(OrderStatus status) =>
        status is OrderStatus.Pending or OrderStatus.Confirmed;

    public static OrderStatus[] FromNames(params string[] names) =>
        names.Select(n => Enum.Parse<OrderStatus>(n, ignoreCase: true)).ToArray();
}

public enum PaymentStatus
{
    Unpaid = 0,
    Pending = 1,
    Paid = 2,
    Failed = 3,
    Refunded = 4
}

public enum DiscountType
{
    Percentage = 0,
    FixedAmount = 1
}

public enum CouponTargetType
{
    Order = 0,
    Category = 1,
    Brand = 2,
    Product = 3
}

/// <summary>A catalogue attribute a scope rule can test. An order-wide coupon carries no rule at all.</summary>
public enum ScopeAttribute
{
    Category = 0,
    Brand = 1,
    ProductLine = 2,
    Tag = 3,
    Product = 4
}

/// <summary>Whether a rule lets products in, or takes them out again.</summary>
public enum ScopePolarity
{
    Is = 0,
    IsNot = 1
}

/// <summary>How the included rules combine: at least one of them, or every one of them.</summary>
public enum ScopeMatch
{
    Any = 0,
    All = 1
}

public enum DiscountExclusivity
{
    /// <summary>Only the largest applicable discount is taken, which is how coupons behaved before this option existed.</summary>
    BestOnly = 0,
    /// <summary>May add its own discount on basket lines that no chosen coupon has already discounted.</summary>
    StackByScope = 1,
    /// <summary>Never combines with any other coupon on the same order.</summary>
    Exclusive = 2
}

/// <summary>
/// Where a coupon stands with the store's own second-signature rule. The state is set by the server from
/// the discount policy, so an operator cannot mark their own large discount as approved.
/// </summary>
public enum CouponApprovalState
{
    /// <summary>Inside the limits the shop allows one administrator to grant alone.</summary>
    NotRequired = 0,
    /// <summary>Over the approval threshold and inactive until a different administrator signs it off.</summary>
    Pending = 1,
    Approved = 2,
    Rejected = 3
}

public enum PaymentMethod
{
    CashOnDelivery = 0,
    Card = 1,
    MobileFinancialService = 2
}
