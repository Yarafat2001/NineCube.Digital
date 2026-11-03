using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;
using NineCube.Infrastructure.Identity;
using NineCube.Infrastructure.Persistence;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

public sealed class PaymentIntegrityTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>, IAsyncLifetime
{
    private AppDbContext _db = null!;
    private TestCurrentUser _user = null!;
    private Gateway _gateway = null!;
    private PaymentService _payments = null!;
    private Order _order = null!;
    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _db = fixture.NewDbContext();
        var customer = new Customer { Name = "Buyer", Email = "buyer@example.test", CreatedAt = DateTime.UtcNow };
        _order = new Order { Customer = customer, Currency = "BDT", TotalAmount = 1060, SubTotal = 1000,
            ShippingAmount = 60, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        _db.Orders.Add(_order);
        await _db.SaveChangesAsync();
        _user = new TestCurrentUser { Role = UserRole.Customer, CustomerId = customer.Id };
        _gateway = new Gateway();
        _payments = new PaymentService(_db, _user, new SystemClock(), new Notifications(), _gateway);
    }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    [Fact]
    public async Task StartingOnlinePaymentDoesNotMarkOrderPaid()
    {
        var payment = await _payments.ProcessPaymentAsync(new(_order.Id, PaymentMethod.Card));
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Equal("https://sandbox.sslcommerz.com/checkout", payment.RedirectUrl);
        Assert.Equal(PaymentStatus.Unpaid, _order.PaymentStatus);
        Assert.Equal(OrderStatus.Pending, _order.Status);
    }

    [Fact]
    public async Task CustomerCannotReadAnotherCustomersPaymentHistory()
    {
        _user.CustomerId = _order.CustomerId + 100;
        await Assert.ThrowsAsync<NotFoundException>(() => _payments.GetOrderTransactionsAsync(_order.Id));
    }

    [Fact]
    public async Task InventoryRoleCannotReadPayments()
    {
        _user.Role = UserRole.InventoryManager;
        await Assert.ThrowsAsync<ForbiddenException>(() => _payments.GetOrderTransactionsAsync(_order.Id));
    }

    [Fact]
    public async Task UnconfiguredGatewayCreatesNoPayment()
    {
        _gateway.IsConfigured = false;
        await Assert.ThrowsAsync<ResourceConflictException>(() => _payments.ProcessPaymentAsync(new(_order.Id, PaymentMethod.Card)));
        Assert.Empty(await _db.PaymentTransactions.ToListAsync());
    }

    [Fact]
    public async Task AmountMismatchCannotMarkOrderPaid()
    {
        var payment = await _payments.ProcessPaymentAsync(new(_order.Id, PaymentMethod.Card));
        _gateway.Payment = new(payment.TransactionReference, 1, "BDT", true, false);
        await Assert.ThrowsAsync<ResourceConflictException>(() => _payments.ProcessCallbackAsync(new("validation")));
        Assert.Equal(PaymentStatus.Unpaid, _order.PaymentStatus);
    }

    [Fact]
    public async Task RiskFlagCannotMarkOrderPaid()
    {
        _gateway.Payment = new("unknown", 1060, "BDT", true, true);
        await Assert.ThrowsAsync<ResourceConflictException>(() => _payments.ProcessCallbackAsync(new("validation")));
        Assert.Equal(PaymentStatus.Unpaid, _order.PaymentStatus);
    }

    [Fact]
    public async Task VerifiedCallbackIsIdempotentAndDoesNotConfirmOperationalOrder()
    {
        var payment = await _payments.ProcessPaymentAsync(new(_order.Id, PaymentMethod.Card));
        _gateway.Payment = new(payment.TransactionReference, 1060, "BDT", true, false);
        await _payments.ProcessCallbackAsync(new("validation"));
        await _payments.ProcessCallbackAsync(new("validation"));
        Assert.Equal(PaymentStatus.Paid, _order.PaymentStatus);
        Assert.Equal(OrderStatus.Pending, _order.Status);
        Assert.Single(await _db.PaymentTransactions.ToListAsync());
    }

    [Fact]
    public async Task LatePaymentIsRecordedForReconciliationWithoutReopeningOrder()
    {
        var payment = await _payments.ProcessPaymentAsync(new(_order.Id, PaymentMethod.Card));
        _order.Status = OrderStatus.Cancelled;
        await _db.SaveChangesAsync();
        _gateway.Payment = new(payment.TransactionReference, 1060, "BDT", true, false);
        var receipt = await _payments.ProcessCallbackAsync(new("validation"));
        Assert.Equal(PaymentStatus.Paid, receipt.Status);
        Assert.Equal(OrderStatus.Cancelled, _order.Status);
        Assert.True(await _db.AuditLogs.AnyAsync(a => a.Action == "payment.reconciliation_required"));
    }

    [Fact]
    public async Task PaidGiftCardPurchaseIssuesExactlyOnceAndQueuesRecipientEmail()
    {
        var purchase = new GiftCardPurchase { OrderId = _order.Id, RecipientEmail = "recipient@example.test", RecipientName = "Recipient" };
        _db.GiftCardPurchases.Add(purchase);
        await _db.SaveChangesAsync();
        var payment = await _payments.ProcessPaymentAsync(new(_order.Id, PaymentMethod.Card));
        Assert.Null(purchase.GiftCardId);
        _gateway.Payment = new(payment.TransactionReference, 1060, "BDT", true, false);
        await _payments.ProcessCallbackAsync(new("validation"));
        await _payments.ProcessCallbackAsync(new("validation"));
        Assert.NotNull(purchase.GiftCardId);
        Assert.Equal(OrderStatus.Delivered, _order.Status);
        Assert.Single(await _db.EmailDeliveries.Where(e => e.Key == $"gift-card:{purchase.Id}").ToListAsync());
    }

    private sealed class Gateway : IPaymentGateway
    {
        public bool IsConfigured { get; set; } = true;
        public VerifiedPayment Payment { get; set; } = new("ref", 1060, "BDT", true, false);
        public Task<GatewaySession> CreateSessionAsync(Order order, string reference, CancellationToken ct) => Task.FromResult(new GatewaySession("https://sandbox.sslcommerz.com/checkout"));
        public Task<VerifiedPayment> VerifyAsync(string id, CancellationToken ct) => Task.FromResult(Payment);
    }
    private sealed class Notifications : INotificationWriter
    {
        public void Add(int userId, NotificationType type, string title, string body, string? link) { }
        public Task AddForStaffAsync(NotificationType type, string title, string body, string? link, CancellationToken ct = default) => Task.CompletedTask;
        public Task QueueLowStockAsync(int productId, CancellationToken ct = default) => Task.CompletedTask;
    }
}
