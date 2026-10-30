using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IPaymentService
{
    Task<PaymentTransactionDto> ProcessPaymentAsync(ProcessPaymentRequest request, CancellationToken ct = default);
    Task<PaymentTransactionDto> ProcessCallbackAsync(PaymentCallbackRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<PaymentTransactionDto>> GetOrderTransactionsAsync(int orderId, CancellationToken ct = default);
}

public sealed class PaymentService : IPaymentService
{
    private readonly IAppDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;
    private readonly INotificationWriter _notifications;

    public PaymentService(
        IAppDbContext db,
        ICurrentUser currentUser,
        IClock clock,
        INotificationWriter notifications)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
        _notifications = notifications;
    }

    public async Task<PaymentTransactionDto> ProcessPaymentAsync(ProcessPaymentRequest request, CancellationToken ct = default)
    {
        var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException($"Order {request.OrderId} was not found.");

        if (_currentUser.Role == UserRole.Customer && _currentUser.CustomerId != order.CustomerId)
        {
            throw new NotFoundException($"Order {request.OrderId} was not found.");
        }

        if (order.PaymentStatus == PaymentStatus.Paid)
        {
            throw new ResourceConflictException("This order has already been paid.", "order_already_paid");
        }

        if (order.Status is OrderStatus.Cancelled or OrderStatus.Rejected)
        {
            throw new ResourceConflictException($"Cannot process payment for an order in {order.Status} status.", "invalid_order_status");
        }

        var now = _clock.UtcNow;
        var reference = $"TX-{order.Id}-{Guid.NewGuid():N}"[..32].ToUpperInvariant();

        // For CashOnDelivery: Transaction remains pending until collection
        // For Card / MFS: Captures payment immediately
        var isImmediateCapture = request.Provider != PaymentMethod.CashOnDelivery;
        var txStatus = isImmediateCapture ? PaymentStatus.Paid : PaymentStatus.Pending;

        var transaction = new PaymentTransaction
        {
            OrderId = order.Id,
            Amount = order.TotalAmount,
            Currency = order.Currency,
            Provider = request.Provider,
            TransactionReference = reference,
            Status = txStatus,
            CreatedAt = now
        };

        _db.PaymentTransactions.Add(transaction);

        order.PaymentMethod = request.Provider;
        order.PaymentStatus = txStatus;
        order.UpdatedAt = now;

        if (txStatus == PaymentStatus.Paid && order.Status == OrderStatus.Pending)
        {
            order.Status = OrderStatus.Confirmed;
        }

        await _db.SaveChangesAsync(ct);

        if (txStatus == PaymentStatus.Paid && _currentUser.UserId is int userId)
        {
            _notifications.Add(
                userId,
                NotificationType.OrderStatusChanged,
                $"Payment confirmed for Order #{order.Id}",
                $"Received {order.TotalAmount:0.00} {order.Currency} via {request.Provider}.",
                $"/orders/{order.Id}");
        }

        return new PaymentTransactionDto(
            transaction.Id,
            transaction.OrderId,
            transaction.Amount,
            transaction.Currency,
            transaction.Provider,
            transaction.TransactionReference,
            transaction.Status,
            transaction.CreatedAt);
    }

    public async Task<PaymentTransactionDto> ProcessCallbackAsync(PaymentCallbackRequest request, CancellationToken ct = default)
    {
        var transaction = await _db.PaymentTransactions
            .Include(t => t.Order)
            .FirstOrDefaultAsync(t => t.OrderId == request.OrderId && t.TransactionReference == request.TransactionReference, ct)
            ?? throw new NotFoundException("Payment transaction was not found.");

        transaction.Status = request.Success ? PaymentStatus.Paid : PaymentStatus.Failed;
        transaction.ProviderPayload = request.ProviderPayload;

        if (transaction.Order is not null)
        {
            transaction.Order.PaymentStatus = transaction.Status;
            transaction.Order.UpdatedAt = _clock.UtcNow;

            if (request.Success && transaction.Order.Status == OrderStatus.Pending)
            {
                transaction.Order.Status = OrderStatus.Confirmed;
            }
        }

        await _db.SaveChangesAsync(ct);

        return new PaymentTransactionDto(
            transaction.Id,
            transaction.OrderId,
            transaction.Amount,
            transaction.Currency,
            transaction.Provider,
            transaction.TransactionReference,
            transaction.Status,
            transaction.CreatedAt);
    }

    public async Task<IReadOnlyList<PaymentTransactionDto>> GetOrderTransactionsAsync(int orderId, CancellationToken ct = default)
    {
        var transactions = await _db.PaymentTransactions.AsNoTracking()
            .Where(t => t.OrderId == orderId)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new PaymentTransactionDto(
                t.Id,
                t.OrderId,
                t.Amount,
                t.Currency,
                t.Provider,
                t.TransactionReference,
                t.Status,
                t.CreatedAt))
            .ToListAsync(ct);

        return transactions;
    }
}
