using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IDashboardService
{
    Task<DashboardDto> ForCurrentUserAsync(CancellationToken ct = default);
}

/// <summary>
/// The customer's own numbers, read straight from the orders table rather than from a cache, so
/// the dashboard can never disagree with "My orders".
/// </summary>
public sealed class DashboardService(IAppDbContext db, ICurrentUser currentUser) : IDashboardService
{
    private static readonly OrderStatus[] StatusOrder =
    [
        OrderStatus.Pending, OrderStatus.Confirmed, OrderStatus.Shipped, OrderStatus.Delivered, OrderStatus.DeliveryFailed, OrderStatus.Cancelled, OrderStatus.Rejected
    ];

    public async Task<DashboardDto> ForCurrentUserAsync(CancellationToken ct = default)
    {
        var userId = currentUser.UserId ?? throw new UnauthorizedException("Not authenticated.");
        var customerId = currentUser.CustomerId;

        var counts = new Dictionary<OrderStatus, int>();
        var spent = 0m;
        var totalOrders = 0;
        var totalItems = 0;
        string currency = "BDT";
        var recent = new List<DashboardOrderDto>();
        var spending = new List<CurrencySpendDto>();

        if (customerId is not null)
        {
            var orders = await db.Orders.AsNoTracking()
                .Where(o => o.CustomerId == customerId)
                .OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id)
                .Select(o => new
                {
                    o.Id,
                    o.Status,
                    o.TotalAmount,
                    o.PaymentStatus,
                    o.GiftCardAmount,
                    Collected = o.PaymentTransactions.Where(p => p.Status == PaymentStatus.Paid && p.Currency == o.Currency).Sum(p => (decimal?)p.Amount) ?? 0,
                    HasReceipt = o.PaymentTransactions.Any(p => p.Status == PaymentStatus.Paid && p.Currency == o.Currency),
                    Refunded = db.RefundRecords.Where(r => r.OrderId == o.Id && r.Status == "Settled").Sum(r => (decimal?)r.Amount) ?? 0,
                    o.Currency,
                    o.CreatedAt,
                    ItemCount = o.Items.Sum(i => i.Quantity)
                })
                .ToListAsync(ct);

            totalOrders = orders.Count;
            currency = orders.FirstOrDefault()?.Currency ?? "BDT";
            spending = orders.GroupBy(o => o.Currency).Select(g => new CurrencySpendDto(g.Key,
                g.Sum(o => (o.HasReceipt ? o.Collected : o.PaymentStatus is PaymentStatus.Paid or PaymentStatus.Refunded ? o.TotalAmount : 0)
                    + o.GiftCardAmount - o.Refunded))).ToList();
            spent = spending.FirstOrDefault(s => s.Currency == currency)?.Amount ?? 0;

            foreach (var order in orders)
            {
                counts[order.Status] = counts.GetValueOrDefault(order.Status) + 1;

                // Money and items actually committed: a cancelled or rejected order released its
                // stock again, so it counts for neither the spend nor the item total.
                if (OrderStatusRules.ReservationsReleased(order.Status)) continue;

                totalItems += order.ItemCount;
            }

            recent = orders.Take(5)
                .Select(o => new DashboardOrderDto(o.Id, o.Status.ToString(), o.TotalAmount, o.Currency, o.CreatedAt, o.ItemCount))
                .ToList();
        }

        var byStatus = StatusOrder
            .Select(s => new StatusCountDto(s.ToString(), counts.GetValueOrDefault(s)))
            .ToList();

        var notificationRows = await db.Notifications.AsNoTracking()
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.Id)
            .Take(5)
            .Select(n => new { n.Id, n.Type, n.Title, n.Body, n.Link, n.IsRead, n.CreatedAt, n.ReadAt })
            .ToListAsync(ct);

        var unread = await db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead, ct);

        return new DashboardDto(
            totalOrders,
            byStatus,
            decimal.Round(spent, 2, MidpointRounding.AwayFromZero),
            currency,
            totalItems,
            recent,
            notificationRows
                .Select(n => new NotificationDto(n.Id, n.Type, n.Title, n.Body, n.Link, n.IsRead, n.CreatedAt, n.ReadAt))
                .ToList(),
            unread, spending);
    }
}
