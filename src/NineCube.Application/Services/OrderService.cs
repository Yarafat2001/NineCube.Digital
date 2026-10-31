using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>
/// <paramref name="Replayed"/> is true when the call was served from a previously stored
/// Idempotency-Key, so the API can answer 200 (replay) instead of 201 (created).
/// </summary>
public sealed record OrderPlacementResult(OrderDto Order, bool Replayed);

public interface IOrderService
{
    Task<OrderPlacementResult> PlaceOrderAsync(CreateOrderRequest request, string? idempotencyKey, CancellationToken ct = default);
    Task<OrderDto> GetOrderAsync(int id, CancellationToken ct = default);
    Task<PagedResult<OrderDto>> ListOrdersAsync(OrderStatus? status, int page, int pageSize, CancellationToken ct = default);
    Task<OrderDto> CancelAsync(int id, CancellationToken ct = default);
    Task<OrderDto> ConfirmAsync(int id, CancellationToken ct = default);
    Task<OrderDto> RejectAsync(int id, CancellationToken ct = default);
    Task<OrderDto> ShipAsync(int id, CancellationToken ct = default);
    Task<InvoiceDto> GetInvoiceAsync(int id, CancellationToken ct = default);
}

/// <summary>
/// Order + stock is one ACID unit of work.
///
/// The design rule: never read-then-write stock. Every decrement is a single conditional
/// UPDATE whose WHERE clause contains the business rule
/// (<c>IsActive = 1 AND StockQuantity &gt;= @qty</c>). If it reports 0 rows affected the whole
/// transaction is rolled back, so a partial order can never be committed. The CHECK constraint
/// (StockQuantity &gt;= 0) is only the last line of defence - it should never actually fire.
///
/// Lines are always processed in ascending ProductId order so that two concurrent multi-line
/// orders cannot take row locks in opposite orders and deadlock.
/// </summary>
public sealed class OrderService : IOrderService
{
    private const int MaxQuantityPerLine = 1000;

    private readonly IAppDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;
    private readonly ITransientErrorPolicy _errors;
    private readonly INotificationWriter _notifications;
    private readonly ICouponService _couponService;
    private readonly IEmailSender _emailSender;

    public OrderService(
        IAppDbContext db,
        ICurrentUser currentUser,
        IClock clock,
        ITransientErrorPolicy errors,
        INotificationWriter notifications,
        ICouponService couponService,
        IEmailSender emailSender)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
        _errors = errors;
        _notifications = notifications;
        _couponService = couponService;
        _emailSender = emailSender;
    }

    // ------------------------------------------------------------------ place

    public Task<OrderPlacementResult> PlaceOrderAsync(CreateOrderRequest request, string? idempotencyKey, CancellationToken ct = default)
    {
        var normalizedKey = string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey.Trim();

        // Retry only on a deadlock / snapshot conflict: the previous attempt's transaction is gone,
        // so re-running cannot decrement stock twice.
        return _errors.ExecuteWithRetryAsync(() => PlaceOrderAttemptAsync(request, normalizedKey, ct));
    }

    private async Task<OrderPlacementResult> PlaceOrderAttemptAsync(CreateOrderRequest request, string? idempotencyKey, CancellationToken ct)
    {
        if (_currentUser.Role != UserRole.Customer)
            throw new ForbiddenException("Only a customer account can place orders.");
        if (_currentUser.CustomerId is null)
            throw new ForbiddenException("This account is not linked to a customer record and cannot place orders.");

        var customerId = _currentUser.CustomerId.Value;
        var lines = NormalizeLines(request);

        // Fast path: a retry of the very same submission returns the original order untouched.
        if (idempotencyKey is not null)
        {
            var existing = await FindByIdempotencyKeyAsync(customerId, idempotencyKey, ct);
            if (existing is not null) return new OrderPlacementResult(existing, Replayed: true);
        }

        // Snapshot the products once (server side prices only - the client never sends money).
        var productIds = lines.Select(l => l.ProductId).ToList();
        var products = await _db.Products.AsNoTracking()
            .Include(p => p.Categories.Where(c => c.IsPrimary)).ThenInclude(c => c.Category)
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        var unknown = productIds.Where(id => !products.ContainsKey(id)).ToList();
        if (unknown.Count > 0)
        {
            throw new BusinessValidationException(
                $"Unknown product id(s): {string.Join(", ", unknown)}.",
                new Dictionary<string, string[]> { ["items"] = new[] { $"Unknown product id(s): {string.Join(", ", unknown)}." } });
        }

        if (products.Values.Select(p => p.Currency).Distinct().Count() > 1)
            throw new BusinessValidationException("Place USD and BDT products in separate orders. Currency conversion is not applied.");

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        try
        {
            var shortItems = new List<ShortItem>();

            // Ascending ProductId: deterministic lock order, no deadlocks between concurrent orders.
            foreach (var line in lines)
            {
                var snapshot = products[line.ProductId];

                if (!snapshot.IsActive)
                {
                    shortItems.Add(new ShortItem
                    {
                        ProductId = snapshot.Id,
                        Sku = snapshot.Sku,
                        Name = snapshot.Name,
                        Requested = line.Quantity,
                        Available = 0
                    });
                    continue;
                }

                var affected = await _db.Products
                    .Where(p => p.Id == line.ProductId && p.IsActive && p.StockQuantity >= line.Quantity)
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity - line.Quantity), ct);

                if (affected == 0)
                {
                    // Report what is actually left so the client can offer a correction.
                    var available = await _db.Products.AsNoTracking()
                        .Where(p => p.Id == line.ProductId)
                        .Select(p => p.StockQuantity)
                        .FirstOrDefaultAsync(ct);

                    shortItems.Add(new ShortItem
                    {
                        ProductId = snapshot.Id,
                        Sku = snapshot.Sku,
                        Name = snapshot.Name,
                        Requested = line.Quantity,
                        Available = available
                    });
                }
            }

            if (shortItems.Count > 0)
            {
                // Throwing here aborts the whole transaction: every line that did succeed is undone.
                throw new InsufficientStockException(shortItems);
            }

            var now = _clock.UtcNow;
            var order = new Order
            {
                Currency = products.Values.First().Currency,
                CustomerId = customerId,
                Status = OrderStatus.Pending,
                CreatedAt = now,
                UpdatedAt = now,
                IdempotencyKey = idempotencyKey
            };

            foreach (var line in lines)
            {
                var product = products[line.ProductId];
                order.Items.Add(new OrderItem
                {
                    ProductId = product.Id,
                    ProductName = product.Name,
                    PrimaryCategoryName = product.Categories.FirstOrDefault(c => c.IsPrimary)?.Category?.Name ?? "Uncategorized",
                    Quantity = line.Quantity,
                    UnitPrice = product.Price,
                    LineTotal = decimal.Round(product.Price * line.Quantity, 2, MidpointRounding.AwayFromZero)
                });
            }

            var subTotal = order.Items.Sum(i => i.LineTotal);
            order.SubTotal = subTotal;
            order.TotalAmount = subTotal;
            order.PaymentMethod = request.PaymentMethod;
            order.PaymentStatus = PaymentStatus.Unpaid;

            if (!string.IsNullOrWhiteSpace(request.CouponCode))
            {
                var couponResult = await _couponService.ValidateCouponAsync(
                    new ApplyCouponRequest(request.CouponCode, subTotal), ct);

                if (couponResult.IsValid)
                {
                    order.CouponCode = couponResult.Code;
                    order.DiscountAmount = couponResult.DiscountAmount;
                    order.TotalAmount = Math.Max(0, subTotal - couponResult.DiscountAmount);
                }
            }

            _db.Orders.Add(order);
            await _db.SaveChangesAsync(ct); // needs order.Id for the ledger rows

            foreach (var item in order.Items)
            {
                _db.InventoryMovements.Add(new InventoryMovement
                {
                    ProductId = item.ProductId,
                    OrderId = order.Id,
                    Delta = -item.Quantity,
                    Reason = $"Order #{order.Id} placed",
                    CreatedByUserId = _currentUser.UserId,
                    CreatedAt = now
                });
            }

            _db.AuditLogs.Add(new AuditLog
            {
                UserId = _currentUser.UserId,
                Action = AuditActions.OrderPlaced,
                EntityType = nameof(Order),
                EntityId = order.Id.ToString(),
                CreatedAt = now,
                Details = $"total={order.TotalAmount:0.00}; lines={order.Items.Count}"
            });

            await _db.SaveChangesAsync(ct);
            // Critical section ends here: stock decrements, order rows and movements are committed immediately.
            // Row locks on products are released, eliminating lock contention during flash sales.
            await tx.CommitAsync(ct);

            // Send transactional email receipt
            var customer = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == customerId, ct);
            if (customer is not null && !string.IsNullOrWhiteSpace(customer.Email))
            {
                var rows = string.Join("", order.Items.Select(i => $"<tr><td style='padding:6px;border:1px solid #ddd;'>{i.ProductName}</td><td style='padding:6px;border:1px solid #ddd;text-align:center;'>{i.Quantity}</td><td style='padding:6px;border:1px solid #ddd;text-align:right;'>{order.Currency} {i.LineTotal:0.00}</td></tr>"));
                var emailBody = $"<div style='font-family:sans-serif;'><h2>Order Confirmation #{order.Id}</h2><p>Thank you for shopping with NineCube Digital!</p><table style='border-collapse:collapse;width:100%;'><thead><tr style='background:#f4f4f4;'><th style='padding:6px;border:1px solid #ddd;'>Item</th><th style='padding:6px;border:1px solid #ddd;'>Qty</th><th style='padding:6px;border:1px solid #ddd;'>Total</th></tr></thead><tbody>{rows}</tbody></table><p style='font-size:16px;'><strong>Order Total: {order.Currency} {order.TotalAmount:0.00}</strong></p><p>We will notify you as soon as your items are on the way.</p></div>";
                _ = _emailSender.SendEmailAsync(customer.Email, $"Order #{order.Id} Confirmation - NineCube Digital", emailBody, CancellationToken.None);
            }

            // Post-commit side effects: customer and staff inbox notifications and low-stock alerts.
            if (!string.IsNullOrWhiteSpace(order.CouponCode))
            {
                await _couponService.ConsumeCouponAsync(order.CouponCode, ct);
            }
            var money = $"{order.TotalAmount:0.00} {order.Currency}";
            var customerName = await _db.Customers.AsNoTracking()
                .Where(c => c.Id == customerId).Select(c => c.Name).FirstOrDefaultAsync(ct) ?? "Customer";

            if (_currentUser.UserId is int placedBy)
            {
                _notifications.Add(placedBy, NotificationType.OrderPlaced,
                    $"Order #{order.Id} placed",
                    $"{order.Items.Count} line(s) for {money}.",
                    $"/orders/{order.Id}");
            }

            await _notifications.AddForStaffAsync(NotificationType.NewOrder,
                $"New order #{order.Id}",
                $"{customerName} placed an order for {money}.",
                $"/orders/{order.Id}", ct);

            // Every reserved product can now be evaluated for low-stock notification.
            foreach (var item in order.Items)
            {
                await _notifications.QueueLowStockAsync(item.ProductId, ct);
            }

            await _db.SaveChangesAsync(ct);

            var created = await LoadOrderDtoAsync(order.Id, ct)
                ?? throw new NotFoundException($"Order {order.Id} was not found.");

            return new OrderPlacementResult(created, Replayed: false);
        }
        catch (DbUpdateException ex) when (idempotencyKey is not null && _errors.IsUniqueViolation(ex))
        {
            // Two identical submissions raced. The loser rolls back and returns the winner's order:
            // stock was consumed exactly once.
            await tx.RollbackAsync(ct);
            var existing = await FindByIdempotencyKeyAsync(customerId, idempotencyKey, ct);
            if (existing is not null) return new OrderPlacementResult(existing, Replayed: true);
            throw;
        }
    }

    // ------------------------------------------------------------------ status transitions

    public Task<OrderDto> CancelAsync(int id, CancellationToken ct = default) =>
        _errors.ExecuteWithRetryAsync(async () =>
        {
            var isCustomer = _currentUser.Role == UserRole.Customer;
            if (_currentUser.Role is not (UserRole.Customer or UserRole.Staff))
                throw new ForbiddenException("Only the owning customer or a staff member can cancel an order.");

            var reason = isCustomer ? "cancelled by customer" : "cancelled by staff";
            return await TransitionAsync(
                id,
                expected: OrderStatusRules.FromNames("Pending", "Confirmed"),
                target: OrderStatus.Cancelled,
                auditAction: AuditActions.OrderCancelled,
                restoreStock: true,
                movementReason: reason,
                ct: ct);
        });

    public Task<OrderDto> ConfirmAsync(int id, CancellationToken ct = default) =>
        _errors.ExecuteWithRetryAsync(() => TransitionAsync(
            id,
            expected: new[] { OrderStatus.Pending },
            target: OrderStatus.Confirmed,
            auditAction: AuditActions.OrderConfirmed,
            restoreStock: false,
            movementReason: null,
            ct: ct));

    public Task<OrderDto> RejectAsync(int id, CancellationToken ct = default) =>
        _errors.ExecuteWithRetryAsync(() => TransitionAsync(
            id,
            expected: new[] { OrderStatus.Pending },
            target: OrderStatus.Rejected,
            auditAction: AuditActions.OrderRejected,
            restoreStock: true,
            movementReason: "rejected by staff",
            ct: ct));

    public Task<OrderDto> ShipAsync(int id, CancellationToken ct = default) =>
        _errors.ExecuteWithRetryAsync(() => TransitionAsync(
            id,
            expected: new[] { OrderStatus.Confirmed },
            target: OrderStatus.Shipped,
            auditAction: AuditActions.OrderShipped,
            restoreStock: false,
            movementReason: null,
            ct: ct));

    /// <summary>
    /// Every status change is a single conditional UPDATE (<c>WHERE Id = @id AND Status IN (...)</c>).
    /// Exactly one caller can ever win, which is what makes "cancel twice restores stock only once"
    /// true even when both requests arrive at the same instant: the loser gets 0 rows affected and
    /// receives a 409 instead of a second stock restore.
    /// </summary>
    private async Task<OrderDto> TransitionAsync(
        int orderId,
        OrderStatus[] expected,
        OrderStatus target,
        string auditAction,
        bool restoreStock,
        string? movementReason,
        CancellationToken ct)
    {
        var now = _clock.UtcNow;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var query = _db.Orders.Where(o => o.Id == orderId && expected.Contains(o.Status));

        // A customer may only touch their own order. Staff may touch any.
        if (_currentUser.Role == UserRole.Customer)
        {
            var customerId = _currentUser.CustomerId
                ?? throw new ForbiddenException("This account is not linked to a customer record.");
            query = query.Where(o => o.CustomerId == customerId);
        }

        var affected = await query.ExecuteUpdateAsync(
            s => s.SetProperty(o => o.Status, target).SetProperty(o => o.UpdatedAt, now), ct);

        if (affected == 0)
        {
            var current = await _db.Orders.AsNoTracking()
                .Where(o => o.Id == orderId)
                .Select(o => new { o.Status, o.CustomerId })
                .FirstOrDefaultAsync(ct);

            // Deliberately 404, not 403: a customer must not be able to probe for other people's orders.
            if (current is null) throw new NotFoundException($"Order {orderId} was not found.");
            if (_currentUser.Role == UserRole.Customer && current.CustomerId != _currentUser.CustomerId)
                throw new NotFoundException($"Order {orderId} was not found.");

            throw new InvalidStateTransitionException(current.Status, target);
        }

        if (restoreStock)
        {
            await RestoreReservedStockAsync(orderId, movementReason ?? "stock released", now, ct);
        }

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = auditAction,
            EntityType = nameof(Order),
            EntityId = orderId.ToString(),
            CreatedAt = now,
            Details = $"status -> {target}"
        });

        await QueueStatusNotificationsAsync(orderId, target, ct);

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await LoadOrderDtoAsync(orderId, ct) ?? throw new NotFoundException($"Order {orderId} was not found.");
    }

    /// <summary>
    /// Tells the owning customer what happened to their order, in the same transaction as the
    /// status update. Rejected reads as a cancellation because both release the reservation.
    /// </summary>
    private async Task QueueStatusNotificationsAsync(int orderId, OrderStatus target, CancellationToken ct)
    {
        var order = await _db.Orders.AsNoTracking()
            .Where(o => o.Id == orderId)
            .Select(o => new { o.CustomerId })
            .FirstOrDefaultAsync(ct);

        if (order is null) return;

        var userIds = await _db.Users.AsNoTracking()
            .Where(u => u.IsActive && u.CustomerId == order.CustomerId)
            .Select(u => u.Id)
            .ToListAsync(ct);

        var type = target is OrderStatus.Cancelled or OrderStatus.Rejected
            ? NotificationType.OrderCancelled
            : NotificationType.OrderStatusChanged;

        var body = target switch
        {
            OrderStatus.Cancelled => $"Order #{orderId} was cancelled. Any reserved stock was returned.",
            OrderStatus.Rejected => $"Order #{orderId} was rejected. Any reserved stock was returned.",
            OrderStatus.Confirmed => $"Order #{orderId} is confirmed and being prepared.",
            OrderStatus.Shipped => $"Order #{orderId} has been shipped.",
            _ => $"Order #{orderId} is now {target}."
        };

        foreach (var userId in userIds)
        {
            _notifications.Add(userId, type, $"Order #{orderId} {target.ToString().ToLowerInvariant()}", body, $"/orders/{orderId}");
        }
    }

    /// <summary>
    /// Returns the reserved quantities to stock. Only ever called from the winning side of a
    /// conditional status update, which is what guarantees "restore exactly once".
    /// </summary>
    private async Task RestoreReservedStockAsync(int orderId, string reason, DateTime now, CancellationToken ct)
    {
        var items = await _db.OrderItems.AsNoTracking()
            .Where(i => i.OrderId == orderId)
            .OrderBy(i => i.ProductId)
            .Select(i => new { i.ProductId, i.Quantity })
            .ToListAsync(ct);

        foreach (var item in items)
        {
            await _db.Products
                .Where(p => p.Id == item.ProductId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + item.Quantity), ct);

            _db.InventoryMovements.Add(new InventoryMovement
            {
                ProductId = item.ProductId,
                OrderId = orderId,
                Delta = item.Quantity,
                Reason = $"Order #{orderId} {reason}",
                CreatedByUserId = _currentUser.UserId,
                CreatedAt = now
            });
        }
    }

    // ------------------------------------------------------------------ reads

    public async Task<OrderDto> GetOrderAsync(int id, CancellationToken ct = default)
    {
        var order = await _db.Orders.AsNoTracking()
            .Where(o => o.Id == id)
            .Select(o => new { o.Id, o.CustomerId })
            .FirstOrDefaultAsync(ct);

        if (order is null) throw new NotFoundException($"Order {id} was not found.");

        if (_currentUser.Role == UserRole.Customer && order.CustomerId != _currentUser.CustomerId)
            throw new NotFoundException($"Order {id} was not found.");

        return await LoadOrderDtoAsync(id, ct) ?? throw new NotFoundException($"Order {id} was not found.");
    }

    public async Task<PagedResult<OrderDto>> ListOrdersAsync(OrderStatus? status, int page, int pageSize, CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = _db.Orders.AsNoTracking();

        if (_currentUser.Role == UserRole.Customer)
        {
            var customerId = _currentUser.CustomerId
                ?? throw new ForbiddenException("This account is not linked to a customer record.");
            query = query.Where(o => o.CustomerId == customerId);
        }

        if (status is not null) query = query.Where(o => o.Status == status);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(o => new
            {
                o.Id,
                o.CustomerId,
                CustomerName = o.Customer!.Name,
                o.Status,
                o.TotalAmount,
                o.Currency,
                o.CreatedAt,
                o.UpdatedAt,
                o.IdempotencyKey,
                o.SubTotal,
                o.DiscountAmount,
                o.CouponCode,
                o.ShippingAmount,
                o.PaymentStatus,
                o.PaymentMethod,
                o.TrackingNumber,
                o.Carrier,
                Items = o.Items.Select(i => new
                {
                    i.Id,
                    i.ProductId,
                    Sku = i.Product!.Sku,
                    Name = i.ProductName,
                    i.PrimaryCategoryName,
                    i.Quantity,
                    i.UnitPrice,
                    i.LineTotal
                }).ToList()
            })
            .ToListAsync(ct);

        var dtos = items.Select(o => new OrderDto(
            o.Id,
            o.CustomerId,
            o.CustomerName,
            o.Status,
            o.TotalAmount,
            o.CreatedAt,
            o.UpdatedAt,
            o.IdempotencyKey,
            o.Items.Select(i => new OrderItemDto(i.Id, i.ProductId, i.Sku, i.Name, i.Quantity, i.UnitPrice, i.LineTotal, i.PrimaryCategoryName)).ToList(),
            o.Currency,
            o.SubTotal,
            o.DiscountAmount,
            o.CouponCode,
            o.ShippingAmount,
            o.PaymentStatus,
            o.PaymentMethod,
            o.TrackingNumber,
            o.Carrier))
            .ToList();

        return new PagedResult<OrderDto>(dtos, page, pageSize, total);
    }

    public async Task<InvoiceDto> GetInvoiceAsync(int id, CancellationToken ct = default)
    {
        var order = await GetOrderAsync(id, ct);

        var email = await _db.Customers.AsNoTracking()
            .Where(c => c.Id == order.CustomerId)
            .Select(c => c.Email)
            .FirstOrDefaultAsync(ct) ?? string.Empty;

        return new InvoiceDto(
            order.Id,
            order.CreatedAt,
            order.Status.ToString(),
            order.CustomerName ?? "Customer",
            email,
            order.Items,
            order.TotalAmount,
            order.TotalAmount, order.Currency);
    }

    private async Task<OrderDto?> LoadOrderDtoAsync(int id, CancellationToken ct)
    {
        var order = await _db.Orders.AsNoTracking()
            .Where(o => o.Id == id)
            .Select(o => new
            {
                o.Id,
                o.CustomerId,
                CustomerName = o.Customer!.Name,
                o.Status,
                o.TotalAmount,
                o.Currency,
                o.CreatedAt,
                o.UpdatedAt,
                o.IdempotencyKey,
                o.SubTotal,
                o.DiscountAmount,
                o.CouponCode,
                o.ShippingAmount,
                o.PaymentStatus,
                o.PaymentMethod,
                o.TrackingNumber,
                o.Carrier,
                Items = o.Items
                    .OrderBy(i => i.Id)
                    .Select(i => new
                    {
                        i.Id,
                        i.ProductId,
                        Sku = i.Product!.Sku,
                        Name = i.ProductName,
                        i.PrimaryCategoryName,
                        i.Quantity,
                        i.UnitPrice,
                        i.LineTotal
                    }).ToList()
            })
            .FirstOrDefaultAsync(ct);

        if (order is null) return null;

        return new OrderDto(
            order.Id,
            order.CustomerId,
            order.CustomerName,
            order.Status,
            order.TotalAmount,
            order.CreatedAt,
            order.UpdatedAt,
            order.IdempotencyKey,
            order.Items.Select(i => new OrderItemDto(i.Id, i.ProductId, i.Sku, i.Name, i.Quantity, i.UnitPrice, i.LineTotal, i.PrimaryCategoryName)).ToList(),
            order.Currency,
            order.SubTotal,
            order.DiscountAmount,
            order.CouponCode,
            order.ShippingAmount,
            order.PaymentStatus,
            order.PaymentMethod,
            order.TrackingNumber,
            order.Carrier);
    }

    private async Task<OrderDto?> FindByIdempotencyKeyAsync(int customerId, string idempotencyKey, CancellationToken ct)
    {
        var orderId = await _db.Orders.AsNoTracking()
            .Where(o => o.CustomerId == customerId && o.IdempotencyKey == idempotencyKey)
            .Select(o => (int?)o.Id)
            .FirstOrDefaultAsync(ct);

        return orderId is null ? null : await LoadOrderDtoAsync(orderId.Value, ct);
    }

    /// <summary>
    /// Business rules F: at least one line, quantity 1..1000, duplicates merged (so a client
    /// cannot bypass the 1000 cap by splitting the same product across two lines).
    /// </summary>
    private static List<OrderLineRequest> NormalizeLines(CreateOrderRequest request)
    {
        if (request.Items is null || request.Items.Count == 0)
        {
            throw new BusinessValidationException(
                "An order must contain at least one item.",
                new Dictionary<string, string[]> { ["items"] = new[] { "An order must contain at least one item." } });
        }

        var merged = new Dictionary<int, int>();
        foreach (var line in request.Items)
        {
            if (line.ProductId <= 0)
                throw new BusinessValidationException("Every line needs a valid productId.");

            if (line.Quantity is < 1 or > MaxQuantityPerLine)
                throw new BusinessValidationException(
                    $"Quantity for product {line.ProductId} must be between 1 and {MaxQuantityPerLine}.");

            merged[line.ProductId] = merged.TryGetValue(line.ProductId, out var current)
                ? current + line.Quantity
                : line.Quantity;
        }

        var overInMergedLines = merged.Where(kv => kv.Value > MaxQuantityPerLine).Select(kv => kv.Key).ToList();
        if (overInMergedLines.Count > 0)
            throw new BusinessValidationException(
                $"Merged quantity for product id(s) {string.Join(", ", overInMergedLines)} exceeds {MaxQuantityPerLine}.");

        return merged
            .Select(kv => new OrderLineRequest(kv.Key, kv.Value))
            .OrderBy(l => l.ProductId)
            .ToList();
    }
}
