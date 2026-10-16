using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>
/// Writes the audit trail. Every key action (login, role change, order status change, stock
/// adjustment, product change, settings change) lands here through this one component.
/// </summary>
public interface IAuditWriter
{
    Task WriteAsync(string action, string entityType, string? entityId, string? details = null, CancellationToken ct = default);
}

public sealed class AuditWriter : IAuditWriter
{
    private readonly IAppDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;

    public AuditWriter(IAppDbContext db, ICurrentUser currentUser, IClock clock)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task WriteAsync(string action, string entityType, string? entityId, string? details = null, CancellationToken ct = default)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            CreatedAt = _clock.UtcNow,
            Details = details
        });

        await _db.SaveChangesAsync(ct);
    }
}
