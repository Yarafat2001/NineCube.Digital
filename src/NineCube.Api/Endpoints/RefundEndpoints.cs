using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record RefundRequest(decimal Amount, string Reason, int? ServiceCaseId);
public sealed record RefundSettlementRequest(string Method, string Reference);
public sealed class RefundEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api");
        group.MapGet("/orders/{id:int}/refunds", async (int id, IAppDbContext db, ICurrentUser caller, CancellationToken ct) =>
        {
            if (!await db.Orders.AnyAsync(o => o.Id == id && (caller.Role != UserRole.Customer || o.CustomerId == caller.CustomerId), ct)) throw new NotFoundException("Order was not found.");
            return Results.Ok(await db.RefundRecords.AsNoTracking().Where(r => r.OrderId == id).OrderByDescending(r => r.Id).ToListAsync(ct));
        }).RequireAuthorization(Policies.CustomerStaffOrAdmin);
        group.MapPost("/orders/{id:int}/refunds", async (int id, RefundRequest request, IAppDbContext db, IClock clock, ICurrentUser caller, CancellationToken ct) =>
        {
            if (request.Amount <= 0 || decimal.Round(request.Amount, 2) != request.Amount || string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 1000)
                throw new BusinessValidationException("Enter a positive refund amount and reason.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await LockOrder(db, id, ct);
            var order = await db.Orders.SingleOrDefaultAsync(o => o.Id == id, ct) ?? throw new NotFoundException("Order was not found.");
            if (order.PaymentStatus is not (PaymentStatus.Paid or PaymentStatus.Refunded)) throw new BusinessValidationException("Only collected payments can be refunded.");
            var previous = await db.RefundRecords.Where(r => r.OrderId == id && r.Status != "Cancelled").ToListAsync(ct);
            if (request.Amount > order.TotalAmount + order.GiftCardAmount - previous.Sum(r => r.Amount)) throw new ResourceConflictException("Refund exceeds the remaining collected amount.");
            if (request.ServiceCaseId is int caseId)
            {
                var entry = await db.ServiceCases.SingleOrDefaultAsync(c => c.Id == caseId && c.OrderId == id, ct) ?? throw new NotFoundException("Return was not found.");
                if (entry.Status != ServiceCaseStatus.Received) throw new BusinessValidationException("Inspect the returned items before approving their refund.");
                var returned = await db.ReturnLines.AsNoTracking().Where(l => l.ServiceCaseId == caseId).ToListAsync(ct);
                var itemIds = returned.Select(l => l.OrderItemId).ToArray();
                var items = await db.OrderItems.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToListAsync(ct);
                var merchandise = returned.Sum(l => items.Single(i => i.Id == l.OrderItemId).UnitPrice * l.ReceivedQuantity);
                var eligible = order.SubTotal <= 0 ? 0 : decimal.Round(merchandise * Math.Max(0, order.SubTotal - order.DiscountAmount) / order.SubTotal, 2);
                if (request.Amount > eligible - previous.Where(r => r.ServiceCaseId == caseId).Sum(r => r.Amount))
                    throw new BusinessValidationException("Refund exceeds inspected merchandise value after discounts. Shipping is retained.");
            }
            var remainingGift = Math.Max(0, order.GiftCardAmount - previous.Sum(r => r.GiftCardAmount));
            var gift = Math.Min(request.Amount, remainingGift);
            var refund = new RefundRecord { OrderId = id, Amount = request.Amount, GiftCardAmount = gift, ServiceCaseId = request.ServiceCaseId,
                Currency = order.Currency, Reason = request.Reason.Trim(), CreatedAt = clock.UtcNow };
            db.RefundRecords.Add(refund);
            db.AuditLogs.Add(new AuditLog { Action = "refund.approved", EntityType = "Order", EntityId = id.ToString(), Details = request.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture), UserId = caller.UserId, CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.Ok(refund);
        }).RequireAuthorization(Policies.StaffOrAdmin);
        group.MapPost("/refunds/{id:int}/settle", async (int id, RefundSettlementRequest request, IAppDbContext db, IClock clock, ICurrentUser caller, CancellationToken ct) =>
        {
            if (request.Method is not ("BankTransfer" or "Cash" or "GiftCard") || string.IsNullOrWhiteSpace(request.Reference) || request.Reference.Length > 200)
                throw new BusinessValidationException("Choose a settlement method and provide a unique receipt or bank reference.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var refund = await db.RefundRecords.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException("Refund was not found.");
            await LockOrder(db, refund.OrderId, ct);
            await db.ChangeTracker.Entries<RefundRecord>().Single(e => e.Entity == refund).ReloadAsync(ct);
            if (refund.Status == "Settled") return Results.Ok(refund);
            if (refund.Status is not ("Pending" or "NeedsReview")) throw new ResourceConflictException("Reconcile the gateway refund before recording another settlement.");
            if (request.Method == "GiftCard" && refund.Amount != refund.GiftCardAmount) throw new BusinessValidationException("This refund also requires repayment of the cash portion.");
            refund.Method = request.Method; refund.Reference = "manual:" + request.Reference.Trim();
            await CompleteAsync(refund, db, clock, caller, ct); await tx.CommitAsync(ct); return Results.Ok(refund);
        }).RequireAuthorization(Policies.StaffOrAdmin);
        group.MapPost("/refunds/{id:int}/gateway", async (int id, IAppDbContext db, IRefundGateway gateway, IClock clock, ICurrentUser caller, CancellationToken ct) =>
        {
            var refund = await db.RefundRecords.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException("Refund was not found.");
            if (refund.Status == "Settled") return Results.Ok(refund);
            if (refund.Amount == refund.GiftCardAmount) throw new BusinessValidationException("Settle this refund using its gift card method.");
            var payment = await db.PaymentTransactions.AsNoTracking().FirstOrDefaultAsync(p => p.OrderId == refund.OrderId && p.Status == PaymentStatus.Paid && p.Provider != PaymentMethod.CashOnDelivery, ct)
                ?? throw new BusinessValidationException("No verified gateway payment was found.");
            var verified = JsonSerializer.Deserialize<VerifiedPayment>(payment.ProviderPayload ?? "null");
            var bank = verified?.ProviderTransactionId;
            if (string.IsNullOrWhiteSpace(bank)) throw new BusinessValidationException("The bank transaction identifier requires manual reconciliation.");
            GatewayRefund result;
            if (refund.Status == "Pending")
            {
                var claimed = await db.RefundRecords.Where(r => r.Id == id && r.Status == "Pending").ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "Submitting"), ct);
                if (claimed != 1) throw new ResourceConflictException("This refund is already being submitted.");
                try { result = await gateway.InitiateRefundAsync(bank, $"NC-R-{refund.Id}", refund.Amount - refund.GiftCardAmount, refund.Reason, ct); }
                catch
                {
                    await db.RefundRecords.Where(r => r.Id == id && r.Status == "Submitting").ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "NeedsReview"), CancellationToken.None);
                    throw;
                }
            }
            else if (refund.Status == "Processing" && !string.IsNullOrWhiteSpace(refund.Reference)) result = await gateway.QueryRefundAsync(bank, refund.Reference, ct);
            else throw new ResourceConflictException("This refund needs manual provider reconciliation before further action.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await LockOrder(db, refund.OrderId, ct); await db.ChangeTracker.Entries<RefundRecord>().Single(e => e.Entity == refund).ReloadAsync(ct);
            if (refund.Status == "Settled") return Results.Ok(refund);
            refund.Reference = result.Reference; refund.Method = "SSLCOMMERZ";
            if (result.Status == "refunded") await CompleteAsync(refund, db, clock, caller, ct);
            else { refund.Status = result.Status == "cancelled" ? "Cancelled" : "Processing"; await db.SaveChangesAsync(ct); }
            await tx.CommitAsync(ct); return Results.Ok(refund);
        }).RequireAuthorization(Policies.StaffOrAdmin).RequireRateLimiting("checkout");
        group.MapPost("/orders/{id:int}/cod-settlement", async (int id, RefundSettlementRequest request, IAppDbContext db, IClock clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Reference) || request.Reference.Length > 200) throw new BusinessValidationException("Provide the courier remittance reference.");
            await using var tx = await db.Database.BeginTransactionAsync(ct); await LockOrder(db, id, ct);
            var order = await db.Orders.SingleOrDefaultAsync(o => o.Id == id, ct) ?? throw new NotFoundException("Order was not found.");
            if (order.PaymentMethod != PaymentMethod.CashOnDelivery || order.Status != OrderStatus.Delivered) throw new BusinessValidationException("Only delivered COD orders can be settled.");
            if (order.PaymentStatus == PaymentStatus.Paid) return Results.NoContent();
            var reference = "cod:" + request.Reference.Trim();
            if (await db.PaymentTransactions.AnyAsync(p => p.TransactionReference == reference, ct)) throw new ResourceConflictException("This remittance reference is already recorded.");
            order.PaymentStatus = PaymentStatus.Paid; order.PaidAt = clock.UtcNow;
            db.PaymentTransactions.Add(new PaymentTransaction { OrderId = id, Amount = order.TotalAmount, Currency = order.Currency, Provider = PaymentMethod.CashOnDelivery, Status = PaymentStatus.Paid, TransactionReference = reference, CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.NoContent();
        }).RequireAuthorization(Policies.StaffOrAdmin);
    }
    private static Task<int> LockOrder(IAppDbContext db, int id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Orders\" WHERE \"Id\" = {id} FOR UPDATE", ct);
    private static async Task CompleteAsync(RefundRecord refund, IAppDbContext db, IClock clock, ICurrentUser caller, CancellationToken ct)
    {
        var order = await db.Orders.SingleAsync(o => o.Id == refund.OrderId, ct);
        if (refund.GiftCardAmount > 0)
        {
            var restored = await db.GiftCards.Where(g => g.Code == order.GiftCardCode && g.Currency == order.Currency)
                .ExecuteUpdateAsync(s => s.SetProperty(g => g.CurrentBalance, g => g.CurrentBalance + refund.GiftCardAmount), ct);
            if (restored != 1) throw new ResourceConflictException("The original gift card requires reconciliation.");
        }
        refund.Status = "Settled"; refund.SettledAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        var refunded = await db.RefundRecords.Where(r => r.OrderId == order.Id && r.Status == "Settled").SumAsync(r => r.Amount, ct);
        if (refunded >= order.TotalAmount + order.GiftCardAmount) order.PaymentStatus = PaymentStatus.Refunded;
        if (refund.ServiceCaseId is int caseId)
        {
            var entry = await db.ServiceCases.SingleAsync(c => c.Id == caseId, ct);
            entry.Status = ServiceCaseStatus.Completed; entry.UpdatedAt = clock.UtcNow;
        }
        db.AuditLogs.Add(new AuditLog { Action = "refund.settled", EntityType = "RefundRecord", EntityId = refund.Id.ToString(), UserId = caller.UserId, CreatedAt = clock.UtcNow });
        await db.SaveChangesAsync(ct);
    }
}
