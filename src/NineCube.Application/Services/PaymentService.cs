using System.Data;
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

public sealed class PaymentService(IAppDbContext db, ICurrentUser currentUser, IClock clock,
    INotificationWriter notifications, IPaymentGateway gateway, ITransientErrorPolicy? errors = null) : IPaymentService
{
    private async Task<Order> AccessibleOrderAsync(int id, bool pay, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedException("Sign in to view payments.");
        var order = await db.Orders.Include(o => o.Customer).FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new NotFoundException("Order was not found.");
        if (currentUser.Role == UserRole.Customer)
        {
            if (currentUser.CustomerId != order.CustomerId) throw new NotFoundException("Order was not found.");
        }
        else if (pay || !currentUser.IsInRole(UserRole.Staff, UserRole.Administrator))
            throw new ForbiddenException("This account cannot access these payments.");
        return order;
    }

    public async Task<PaymentTransactionDto> ProcessPaymentAsync(ProcessPaymentRequest request, CancellationToken ct = default)
    {
        var order = await AccessibleOrderAsync(request.OrderId, true, ct);
        if (order.PaymentStatus is PaymentStatus.Paid or PaymentStatus.Refunded)
            throw new ResourceConflictException("This order cannot accept another payment.", "order_already_paid");
        if (order.Status is OrderStatus.Cancelled or OrderStatus.Rejected)
            throw new ResourceConflictException("This order is closed.", "invalid_order_status");
        if (order.PaymentStatus == PaymentStatus.Unpaid && order.ReservationExpiresAt <= clock.UtcNow)
            throw new ResourceConflictException("The payment reservation has expired. Please place a new order.", "reservation_expired");
        if (!Enum.IsDefined(request.Provider)) throw new BusinessValidationException("Unknown payment method.");
        if (request.Provider != PaymentMethod.CashOnDelivery && (order.Currency != "BDT" || order.TotalAmount is < 10 or > 500000))
            throw new BusinessValidationException("Online payment supports BDT amounts from 10 to 500,000. Choose cash on delivery for this order.");
        if (request.Provider != PaymentMethod.CashOnDelivery && !gateway.IsConfigured)
            throw new ResourceConflictException("Online payments are not configured. Please choose cash on delivery.", "gateway_unavailable");
        if (request.Provider == PaymentMethod.CashOnDelivery)
        {
            var existing = await db.PaymentTransactions.FirstOrDefaultAsync(t => t.OrderId == order.Id
                && t.Provider == request.Provider && t.Status == PaymentStatus.Pending, ct);
            if (existing is not null) return Dto(existing);
        }
        var transaction = new PaymentTransaction
        {
            OrderId = order.Id, Amount = order.TotalAmount, Currency = order.Currency,
            Provider = request.Provider, TransactionReference = Guid.NewGuid().ToString("N")[..30],
            Status = PaymentStatus.Pending, CreatedAt = clock.UtcNow
        };
        db.PaymentTransactions.Add(transaction);
        await db.SaveChangesAsync(ct);
        // Persist first: even an immediate IPN must resolve the reference.
        string? redirect = null;
        if (request.Provider != PaymentMethod.CashOnDelivery)
            redirect = (await gateway.CreateSessionAsync(order, transaction.TransactionReference, ct)).RedirectUrl;
        order.PaymentMethod = request.Provider;
        if (request.Provider != PaymentMethod.CashOnDelivery && order.Status == OrderStatus.Pending)
            order.ReservationExpiresAt ??= clock.UtcNow.AddMinutes(30);
        if (request.Provider == PaymentMethod.CashOnDelivery) order.ReservationExpiresAt = null;
        await db.SaveChangesAsync(ct);
        return Dto(transaction, redirect);
    }

    public async Task<PaymentTransactionDto> ProcessCallbackAsync(PaymentCallbackRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.ValidationId) || request.ValidationId.Length > 200)
            throw new BusinessValidationException("A valid gateway validation identifier is required.");
        var verified = await gateway.VerifyAsync(request.ValidationId, ct);
        if (!verified.IsPaid || verified.NeedsReview)
            throw new ResourceConflictException("The gateway has not verified this payment for fulfillment.", "payment_unverified");
        if (errors is null) return await ApplyVerifiedAsync(verified, ct);
        return await errors.ExecuteWithRetryAsync(async () =>
        {
            db.ChangeTracker.Clear();
            return await ApplyVerifiedAsync(verified, ct);
        });
    }

    private async Task<PaymentTransactionDto> ApplyVerifiedAsync(VerifiedPayment verified, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var transaction = await db.PaymentTransactions.Include(t => t.Order)
            .FirstOrDefaultAsync(t => t.TransactionReference == verified.Reference, ct)
            ?? throw new NotFoundException("Payment transaction was not found.");
        var order = transaction.Order ?? throw new NotFoundException("Order was not found.");
        if (transaction.Provider == PaymentMethod.CashOnDelivery || transaction.Amount != verified.Amount
            || !string.Equals(transaction.Currency, verified.Currency, StringComparison.OrdinalIgnoreCase))
            throw new ResourceConflictException("Gateway amount or currency does not match the payment.", "payment_mismatch");
        if (transaction.Status == PaymentStatus.Paid)
        {
            await tx.CommitAsync(ct);
            return Dto(transaction);
        }
        transaction.Status = PaymentStatus.Paid;
        transaction.ProviderPayload = System.Text.Json.JsonSerializer.Serialize(verified);
        if (order.Status is OrderStatus.Cancelled or OrderStatus.Rejected || order.PaymentStatus is PaymentStatus.Paid or PaymentStatus.Refunded)
        {
            // Money arrived even though fulfillment is closed: preserve the receipt for reconciliation.
            db.AuditLogs.Add(new AuditLog { Action = "payment.reconciliation_required", EntityType = nameof(Order),
                EntityId = order.Id.ToString(), CreatedAt = clock.UtcNow, Details = $"payment={transaction.TransactionReference}; amount={transaction.Amount}; currency={transaction.Currency}" });
            await notifications.AddForStaffAsync(NotificationType.OrderStatusChanged, $"Payment needs review for Order #{order.Id}",
                "A payment arrived for a closed or already paid order. Review and refund any excess payment.", $"/orders/{order.Id}", ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Dto(transaction);
        }
        order.PaymentStatus = PaymentStatus.Paid;
        order.PaymentMethod = transaction.Provider;
        order.UpdatedAt = clock.UtcNow;
        order.ReservationExpiresAt = null;
        var purchase = await db.GiftCardPurchases.FirstOrDefaultAsync(p => p.OrderId == order.Id, ct);
        if (purchase is not null && purchase.GiftCardId is null)
        {
            var card = new GiftCard { Code = "GC-" + Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16)),
                InitialBalance = transaction.Amount, CurrentBalance = transaction.Amount, Currency = transaction.Currency,
                RecipientEmail = purchase.RecipientEmail, RecipientName = purchase.RecipientName, Note = purchase.Note,
                IsActive = true, CreatedAt = clock.UtcNow };
            db.GiftCards.Add(card);
            await db.SaveChangesAsync(ct);
            purchase.GiftCardId = card.Id;
            order.Status = OrderStatus.Delivered;
            db.EmailDeliveries.Add(new EmailDelivery { Key = $"gift-card:{purchase.Id}", Recipient = purchase.RecipientEmail,
                Subject = "Your NineCube gift card", CreatedAt = clock.UtcNow,
                Body = $"<p>A gift card worth {card.InitialBalance:0.00} {card.Currency} was sent to you.</p><p>Code: <strong>{card.Code}</strong></p><p>{System.Net.WebUtility.HtmlEncode(purchase.Note)}</p>" });
        }
        // Confirmation and shipping remain explicit operational decisions.
        var userId = await db.Users.Where(u => u.CustomerId == order.CustomerId).Select(u => (int?)u.Id).FirstOrDefaultAsync(ct);
        if (userId is int id) notifications.Add(id, NotificationType.OrderStatusChanged,
            $"Payment received for Order #{order.Id}", $"Received {transaction.Amount:0.00} {transaction.Currency}.", $"/orders/{order.Id}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Dto(transaction);
    }

    public async Task<IReadOnlyList<PaymentTransactionDto>> GetOrderTransactionsAsync(int orderId, CancellationToken ct = default)
    {
        await AccessibleOrderAsync(orderId, false, ct);
        return (await db.PaymentTransactions.AsNoTracking().Where(t => t.OrderId == orderId)
            .OrderByDescending(t => t.CreatedAt).ToListAsync(ct)).Select(t => Dto(t)).ToList();
    }

    private static PaymentTransactionDto Dto(PaymentTransaction t, string? redirect = null) =>
        new(t.Id, t.OrderId, t.Amount, t.Currency, t.Provider, t.TransactionReference, t.Status, t.CreatedAt, redirect);
}
