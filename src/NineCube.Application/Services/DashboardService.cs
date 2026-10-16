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
        OrderStatus.Pending, OrderStatus.Confirmed, OrderStatus.Shipped, OrderStatus.Cancelled, OrderStatus.Rejected
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
                    o.Currency,
                    o.CreatedAt,
                    ItemCount = o.Items.Sum(i => i.Quantity)
                })
                .ToListAsync(ct);

            totalOrders = orders.Count;
            currency = orders.FirstOrDefault()?.Currency ?? "BDT";

            foreach (var order in orders)
            {
                counts[order.Status] = counts.GetValueOrDefault(order.Status) + 1;

                // Money and items actually committed: a cancelled or rejected order released its
                // stock again, so it counts for neither the spend nor the item total.
                if (OrderStatusRules.ReservationsReleased(order.Status)) continue;

                totalItems += order.ItemCount;
                spent += order.TotalAmount;
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
            unread);
    }
}
