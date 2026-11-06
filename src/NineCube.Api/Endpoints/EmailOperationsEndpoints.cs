using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;
using NineCube.Infrastructure.Email;

namespace NineCube.Api.Endpoints;

public sealed class EmailOperationsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/operations/email").RequireAuthorization(Policies.AdministratorOnly);
        group.MapGet("/", async (IAppDbContext db, IConfiguration config, IOptions<EmailWorkerOptions> workerOptions, CancellationToken ct) => Results.Ok(new
        {
            configured = !string.IsNullOrWhiteSpace(config["Email:Smtp:Host"]),
            maxAttempts = workerOptions.Value.MaxAttempts,
            pending = await db.EmailDeliveries.CountAsync(m => m.SentAt == null && m.Attempts < workerOptions.Value.MaxAttempts, ct),
            failed = await db.EmailDeliveries.AsNoTracking().Where(m => m.SentAt == null && m.Attempts >= workerOptions.Value.MaxAttempts)
                .OrderBy(m => m.Id).Take(100)
                .Select(m => new { m.Id, m.Subject, m.CreatedAt, m.Attempts, m.LastError, m.FailedAt }).ToListAsync(ct)
        }));
        group.MapPost("/{id:int}/retry", async (int id, IAppDbContext db, ICurrentUser user, IClock clock, IOptions<EmailWorkerOptions> workerOptions, CancellationToken ct) =>
        {
            var maxAttempts = workerOptions.Value.MaxAttempts;
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var updated = await db.EmailDeliveries.Where(m => m.Id == id && m.SentAt == null && m.Attempts >= maxAttempts)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.Attempts, 0)
                    .SetProperty(m => m.LeaseUntil, (DateTime?)null)
                    .SetProperty(m => m.LastError, (string?)null)
                    .SetProperty(m => m.FailedAt, (DateTime?)null), ct);
            if (updated != 1) throw new ResourceConflictException("Only failed email deliveries can be retried.");
            db.AuditLogs.Add(new AuditLog { UserId = user.UserId, Action = "email.retry", EntityType = "EmailDelivery", EntityId = id.ToString(), CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");
    }
}
