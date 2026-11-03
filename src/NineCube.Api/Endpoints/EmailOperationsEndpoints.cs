using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed class EmailOperationsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/operations/email").RequireAuthorization(Policies.AdministratorOnly);
        group.MapGet("/", async (IAppDbContext db, IConfiguration config, CancellationToken ct) => Results.Ok(new
        {
            configured = !string.IsNullOrWhiteSpace(config["Email:Smtp:Host"]),
            pending = await db.EmailDeliveries.CountAsync(m => m.SentAt == null && m.Attempts < 5, ct),
            failed = await db.EmailDeliveries.AsNoTracking().Where(m => m.SentAt == null && m.Attempts >= 5)
                .OrderBy(m => m.Id).Take(100).Select(m => new { m.Id, m.Subject, m.CreatedAt, m.Attempts }).ToListAsync(ct)
        }));
        group.MapPost("/{id:int}/retry", async (int id, IAppDbContext db, ICurrentUser user, IClock clock, CancellationToken ct) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var updated = await db.EmailDeliveries.Where(m => m.Id == id && m.SentAt == null && m.Attempts >= 5)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.Attempts, 0).SetProperty(m => m.LeaseUntil, (DateTime?)null), ct);
            if (updated != 1) throw new ResourceConflictException("Only failed email deliveries can be retried.");
            db.AuditLogs.Add(new AuditLog { UserId = user.UserId, Action = "email.retry", EntityType = "EmailDelivery", EntityId = id.ToString(), CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");
    }
}
