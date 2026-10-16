using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>
/// Raises the notifications that belong to an event. Every Add here is a tracked-entity insert
/// on the ambient <see cref="IAppDbContext"/>: the caller's transaction commits them together
/// with the order, or not at all. Nothing in this interface saves or commits.
/// </summary>
public interface INotificationWriter
{
    void Add(int userId, NotificationType type, string title, string body, string? link);

    /// <summary>Notifies every active Staff / InventoryManager / Administrator account.</summary>
    Task AddForStaffAsync(NotificationType type, string title, string body, string? link, CancellationToken ct = default);

    /// <summary>
    /// Notifies staff when a product has fallen to or below the low stock threshold. A product that
    /// is already sitting unread in someone's inbox does not raise a second notification.
    /// </summary>
    Task QueueLowStockAsync(int productId, CancellationToken ct = default);
}

public interface INotificationService
{
    Task<PagedResult<NotificationDto>> ListAsync(bool unreadOnly, int page, int pageSize, CancellationToken ct = default);
    Task<UnreadCountDto> UnreadCountAsync(CancellationToken ct = default);
    Task<NotificationDto> MarkReadAsync(int id, CancellationToken ct = default);
    Task<int> MarkAllReadAsync(CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}

/// <summary>
/// Notifications are per user, and a user may only ever see or change their own rows.
/// Everything is keyed on <see cref="ICurrentUser.UserId"/> in the query itself, so asking for
/// somebody else's id produces a 404 rather than a 403 and never leaks existence.
/// </summary>
public sealed class NotificationService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IClock clock,
    ISettingsService settings) : INotificationWriter, INotificationService
{
    private static readonly UserRole[] StaffRoles = [UserRole.Staff, UserRole.InventoryManager, UserRole.Administrator];

    // ------------------------------------------------------------------ writing

    public void Add(int userId, NotificationType type, string title, string body, string? link)
    {
        if (userId <= 0) return;

        db.Notifications.Add(new Notification
        {
            UserId = userId,
            Type = type,
            Title = Truncate(title, 200),
            Body = Truncate(body, 500),
            Link = string.IsNullOrWhiteSpace(link) ? null : Truncate(link, 300),
            IsRead = false,
            CreatedAt = clock.UtcNow
        });
    }

    public async Task AddForStaffAsync(NotificationType type, string title, string body, string? link, CancellationToken ct = default)
    {
        var ids = await db.Users.AsNoTracking()
            .Where(u => u.IsActive && StaffRoles.Contains(u.Role))
            .Select(u => u.Id)
            .ToListAsync(ct);

        foreach (var id in ids) Add(id, type, title, body, link);
    }

    public async Task QueueLowStockAsync(int productId, CancellationToken ct = default)
    {
        var product = await db.Products.AsNoTracking()
            .Where(p => p.Id == productId)
            .Select(p => new { p.Id, p.Name, p.Sku, p.StockQuantity })
            .FirstOrDefaultAsync(ct);

        if (product is null) return;

        var threshold = await settings.GetLowStockThresholdAsync(ct);
        if (product.StockQuantity > threshold) return;

        // Same product still unread for the same recipient: that recipient already knows.
        var link = $"/inventory?product={product.Id}";
        var alreadyPending = await db.Notifications.AsNoTracking()
            .Where(n => !n.IsRead && n.Type == NotificationType.LowStock && n.Link == link)
            .AnyAsync(ct);

        if (alreadyPending) return;

        await AddForStaffAsync(
            NotificationType.LowStock,
            $"Low stock: {Truncate(product.Name, 120)}",
            $"{product.Sku} is down to {product.StockQuantity} (threshold {threshold}).",
            link,
            ct);
    }

    // ------------------------------------------------------------------ reading

    public async Task<PagedResult<NotificationDto>> ListAsync(bool unreadOnly, int page, int pageSize, CancellationToken ct = default)
    {
        var userId = RequireUserId();
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = db.Notifications.AsNoTracking().Where(n => n.UserId == userId);
        if (unreadOnly) query = query.Where(n => !n.IsRead);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new
            {
                n.Id, n.Type, n.Title, n.Body, n.Link, n.IsRead, n.CreatedAt, n.ReadAt
            })
            .ToListAsync(ct);

        return new PagedResult<NotificationDto>(
            items.Select(i => new NotificationDto(i.Id, i.Type, i.Title, i.Body, i.Link, i.IsRead, i.CreatedAt, i.ReadAt)).ToList(),
            page, pageSize, total);
    }

    public async Task<UnreadCountDto> UnreadCountAsync(CancellationToken ct = default)
    {
        var userId = RequireUserId();
        return new UnreadCountDto(await db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead, ct));
    }

    public async Task<NotificationDto> MarkReadAsync(int id, CancellationToken ct = default)
    {
        var userId = RequireUserId();
        var now = clock.UtcNow;

        // Conditional update, so marking twice is a no-op rather than a second ReadAt.
        await db.Notifications
            .Where(n => n.Id == id && n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s
                .SetProperty(n => n.IsRead, true)
                .SetProperty(n => n.ReadAt, now), ct);

        var row = await db.Notifications.AsNoTracking()
            .Where(n => n.Id == id && n.UserId == userId)
            .Select(n => new { n.Id, n.Type, n.Title, n.Body, n.Link, n.IsRead, n.CreatedAt, n.ReadAt })
            .FirstOrDefaultAsync(ct);

        if (row is null) throw new NotFoundException($"Notification {id} was not found.");

        return new NotificationDto(row.Id, row.Type, row.Title, row.Body, row.Link, row.IsRead, row.CreatedAt, row.ReadAt);
    }

    public async Task<int> MarkAllReadAsync(CancellationToken ct = default)
    {
        var userId = RequireUserId();
        return await db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s
                .SetProperty(n => n.IsRead, true)
                .SetProperty(n => n.ReadAt, clock.UtcNow), ct);
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var userId = RequireUserId();
        var affected = await db.Notifications
            .Where(n => n.Id == id && n.UserId == userId)
            .ExecuteDeleteAsync(ct);

        if (affected == 0) throw new NotFoundException($"Notification {id} was not found.");
    }

    private int RequireUserId() =>
        currentUser.UserId ?? throw new UnauthorizedException("Not authenticated.");

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..(max - 1)] + "…";
}
