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
    Cancelled = 4
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
            [OrderStatus.Shipped] = Array.Empty<OrderStatus>(),
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

public enum PaymentMethod
{
    CashOnDelivery = 0,
    Card = 1,
    MobileFinancialService = 2
}
