using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IReportService
{
    Task<SalesSummaryDto> GetSalesSummaryAsync(DateTime? from, DateTime? to, CancellationToken ct = default, string currency = "BDT");
}

public sealed class ReportService(IAppDbContext db, IClock clock) : IReportService
{
    // Order creation dates select the cohort. Receipts and settled refunds show its current
    // reconciled position, including late payments on cancelled orders.
    public async Task<SalesSummaryDto> GetSalesSummaryAsync(DateTime? from, DateTime? to, CancellationToken ct = default, string currency = "BDT")
    {
        currency = currency.ToUpperInvariant();
        if (currency is not ("USD" or "BDT")) throw new BusinessValidationException("Use USD or BDT currency.");
        var toUtc = (to ?? clock.UtcNow).ToUniversalTime();
        var fromUtc = (from ?? toUtc.AddDays(-30)).ToUniversalTime();
        if (fromUtc > toUtc) throw new BusinessValidationException("'from' must be earlier than 'to'.");

        var query = db.Orders.AsNoTracking().Where(o => o.CreatedAt >= fromUtc && o.CreatedAt <= toUtc && o.Currency == currency);
        var orders = await query.Select(o => new
        {
            o.Id, o.Status, o.TotalAmount, o.GiftCardAmount, o.PaymentStatus, o.PaymentMethod,
            Collected = o.PaymentTransactions.Where(p => p.Status == PaymentStatus.Paid && p.Currency == currency).Sum(p => (decimal?)p.Amount),
            HasReceipt = o.PaymentTransactions.Any(p => p.Status == PaymentStatus.Paid && p.Currency == currency)
        }).ToListAsync(ct);
        var refunds = await db.RefundRecords.AsNoTracking()
            .Where(r => r.Status == "Settled" && r.Currency == currency && query.Any(o => o.Id == r.OrderId))
            .Select(r => new { r.OrderId, r.Amount, r.GiftCardAmount }).ToListAsync(ct);

        // Legacy paid orders may predate transaction records. Pending attempts never count.
        var collectedByOrder = orders.ToDictionary(o => o.Id, o => o.HasReceipt ? o.Collected ?? 0 :
            o.PaymentStatus is PaymentStatus.Paid or PaymentStatus.Refunded ? o.TotalAmount : 0);
        var refundedByOrder = refunds.GroupBy(r => r.OrderId).ToDictionary(g => g.Key, g => g.Sum(r => r.Amount - r.GiftCardAmount));
        var collected = collectedByOrder.Values.Sum();
        var refunded = refundedByOrder.Values.Sum();
        var byStatus = Enum.GetValues<OrderStatus>().Select(status =>
        {
            var group = orders.Where(o => o.Status == status).ToList();
            return new SalesByStatusDto(status.ToString(), group.Count,
                group.Sum(o => collectedByOrder[o.Id] - refundedByOrder.GetValueOrDefault(o.Id)),
                orders.Count == 0 ? 0 : decimal.Round(group.Count * 100m / orders.Count, 2));
        }).OrderBy(s => s.Status).ToList();
        return new(fromUtc, toUtc, orders.Count, collected - refunded, byStatus, currency,
            orders.Where(o => !OrderStatusRules.ReservationsReleased(o.Status)).Sum(o => o.TotalAmount + o.GiftCardAmount),
            collected, refunded,
            orders.Where(o => !OrderStatusRules.ReservationsReleased(o.Status) && o.PaymentMethod == PaymentMethod.CashOnDelivery && o.PaymentStatus != PaymentStatus.Refunded)
                .Sum(o => Math.Max(0, o.TotalAmount - collectedByOrder[o.Id])),
            orders.Sum(o => o.GiftCardAmount), refunds.Sum(r => r.GiftCardAmount));
    }
}
