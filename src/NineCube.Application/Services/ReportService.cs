using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IReportService
{
    Task<SalesSummaryDto> GetSalesSummaryAsync(DateTime? from, DateTime? to, CancellationToken ct = default, string currency = "BDT");
}

public sealed class ReportService : IReportService
{
    private readonly IAppDbContext _db;
    private readonly IClock _clock;

    public ReportService(IAppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    /// <summary>
    /// Read-only summary. Revenue counts orders that still stand (Pending, Confirmed, Shipped);
    /// Rejected and Cancelled orders are reported for completeness but contribute no revenue,
    /// because their stock was released.
    /// </summary>
    public async Task<SalesSummaryDto> GetSalesSummaryAsync(DateTime? from, DateTime? to, CancellationToken ct = default, string currency = "BDT")
    {
        currency = currency.ToUpperInvariant();
        if (currency is not ("USD" or "BDT")) throw new BusinessValidationException("Use USD or BDT currency.");
        var toUtc = (to ?? _clock.UtcNow).ToUniversalTime();
        var fromUtc = (from ?? toUtc.AddDays(-30)).ToUniversalTime();

        if (fromUtc > toUtc)
            throw new BusinessValidationException("'from' must be earlier than 'to'.");

        var orders = await _db.Orders.AsNoTracking()
            .Where(o => o.CreatedAt >= fromUtc && o.CreatedAt <= toUtc && o.Currency == currency)
            .Select(o => new { o.Status, o.TotalAmount })
            .ToListAsync(ct);

        var byStatus = orders
            .GroupBy(o => o.Status)
            .OrderBy(g => g.Key)
            .Select(g => new SalesByStatusDto(
                g.Key.ToString(),
                g.Count(),
                g.Where(o => !OrderStatusRules.ReservationsReleased(o.Status)).Sum(o => o.TotalAmount),
                orders.Count == 0 ? 0m : decimal.Round(g.Count() * 100m / orders.Count, 2)))
            .ToList();

        foreach (var status in Enum.GetValues<OrderStatus>())
        {
            if (byStatus.All(s => s.Status != status.ToString()))
            {
                byStatus.Add(new SalesByStatusDto(status.ToString(), 0, 0m, 0m));
            }
        }

        byStatus = byStatus.OrderBy(s => s.Status).ToList();

        var revenue = orders
            .Where(o => !OrderStatusRules.ReservationsReleased(o.Status))
            .Sum(o => o.TotalAmount);

        return new SalesSummaryDto(fromUtc, toUtc, orders.Count, revenue, byStatus, currency);
    }
}
