using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record GuestRecoveryRequest(int OrderId, string Email);
public sealed record GuestRecoveryConfirm(int OrderId, string Token);
public sealed class GuestRecoveryEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/guest/recovery").RequireRateLimiting("auth");
        group.MapPost("/request", async (GuestRecoveryRequest request, IAppDbContext db, IClock clock, CancellationToken ct) =>
        {
            if (request.Email?.Length > 256) throw new BusinessValidationException("Email is too long.");
            var email = request.Email?.Trim().ToLowerInvariant() ?? "";
            var order = await db.Orders.AsNoTracking().Include(o => o.Customer)
                .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.Customer!.Email.ToLower() == email, ct);
            if (order is null || await db.Users.AnyAsync(u => u.CustomerId == order.CustomerId, ct)) return Results.NoContent();
            if (await db.GuestRecoverys.AnyAsync(r => r.OrderId == order.Id && r.ExpiresAt > clock.UtcNow.AddMinutes(14), ct)) return Results.NoContent();
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            db.GuestRecoverys.Add(new GuestRecovery { OrderId = order.Id, TokenHash = AccountSecurityEndpoints.Hash(token), ExpiresAt = clock.UtcNow.AddMinutes(15) });
            db.EmailDeliveries.Add(new EmailDelivery { Key = $"guest-recovery:{Guid.NewGuid():N}", Recipient = order.Customer!.Email,
                Subject = $"Recover access to NineCube order #{order.Id}", Body = $"<p>Your recovery token is <strong>{token}</strong>. It expires in fifteen minutes.</p>", CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); return Results.NoContent();
        }).AllowAnonymous();
        group.MapPost("/confirm", async (GuestRecoveryConfirm request, IAppDbContext db, IClock clock, CancellationToken ct) =>
        {
            var hash = AccountSecurityEndpoints.Hash(request.Token ?? "");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == request.OrderId, ct);
            if (order is null || await db.Users.AnyAsync(u => u.CustomerId == order.CustomerId, ct)) throw new BusinessValidationException("Recovery token is invalid or expired.");
            var consumed = await db.GuestRecoverys.Where(r => r.OrderId == request.OrderId && r.TokenHash == hash && r.UsedAt == null && r.ExpiresAt > clock.UtcNow)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.UsedAt, clock.UtcNow), ct);
            if (consumed != 1) throw new BusinessValidationException("Recovery token is invalid or expired.");
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            db.GuestCheckoutSessions.Add(new GuestCheckoutSession { CustomerId = order.CustomerId, TokenHash = AccountSecurityEndpoints.Hash(token), ExpiresAt = clock.UtcNow.AddDays(30) });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.Ok(new { token, orderId = order.Id });
        }).AllowAnonymous();
        app.MapPost("/api/me/claim-guest-order", async (GuestRecoveryConfirm request, IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            var hash = AccountSecurityEndpoints.Hash(request.Token ?? "");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Orders\" WHERE \"Id\" = {request.OrderId} FOR UPDATE", ct);
            var order = await db.Orders.Include(o => o.Customer).SingleOrDefaultAsync(o => o.Id == request.OrderId, ct)
                ?? throw new NotFoundException("Order was not found.");
            var user = await db.Users.SingleAsync(u => u.Id == caller.UserId, ct);
            if (user.EmailVerifiedAt is null || !string.Equals(order.Customer!.Email, user.Email, StringComparison.OrdinalIgnoreCase)
                || await db.Users.AnyAsync(u => u.CustomerId == order.CustomerId, ct)
                || !await db.GuestCheckoutSessions.AnyAsync(s => s.CustomerId == order.CustomerId && s.TokenHash == hash && s.ExpiresAt > clock.UtcNow, ct))
                throw new BusinessValidationException("Verify your account email and recover this guest order before linking it.");
            var oldCustomer = order.CustomerId;
            // A claimed order keeps its original snapshot and cannot collide with another retry key.
            order.CustomerId = caller.CustomerId!.Value; order.Customer = null; order.IdempotencyKey = null;
            await db.ServiceCases.Where(c => c.OrderId == order.Id).ExecuteUpdateAsync(s => s.SetProperty(c => c.CustomerId, caller.CustomerId.Value), ct);
            await db.GuestCheckoutSessions.Where(s => s.CustomerId == oldCustomer).ExecuteUpdateAsync(s => s.SetProperty(s => s.ExpiresAt, clock.UtcNow), ct);
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.NoContent();
        }).RequireAuthorization(Policies.CustomerOnly).RequireRateLimiting("auth");
    }
}
