using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;
using NineCube.Application.Services;
using NineCube.Application.Contracts;

namespace NineCube.Api.Endpoints;

public sealed record MfaSettingsRequest(bool Enabled, string Password, string? Code);
public sealed record SecurityCodeRequest(string Code);
public sealed class AccountSecurityEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/signin-code", async (LoginRequest request, IAppDbContext db, IPasswordHasherService hasher, IClock clock, CancellationToken ct) =>
        {
            var email = request.Email?.Trim().ToLowerInvariant();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email && u.IsActive, ct);
            if (user is not null && hasher.Verify(request.Password ?? "", user.PasswordHash)) await AccountCodes.SendAsync(db, user, clock, ct);
            return Results.NoContent();
        }).AllowAnonymous().RequireRateLimiting("auth");
        var group = app.MapGroup("/api/me/security").RequireAuthorization();
        group.MapGet("/", async (IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            var user = await db.Users.AsNoTracking().SingleAsync(u => u.Id == caller.UserId, ct);
            var sessions = await db.RefreshTokens.AsNoTracking().Where(t => t.UserId == user.Id && t.RevokedAtUtc == null && t.ExpiresAtUtc > clock.UtcNow)
                .OrderByDescending(t => t.CreatedAtUtc).Select(t => new { t.Id, t.CreatedAtUtc, t.ExpiresAtUtc }).ToListAsync(ct);
            return Results.Ok(new { verified = user.EmailVerifiedAt != null, user.MfaEnabled, sessions });
        });
        group.MapPost("/mfa", async (MfaSettingsRequest request, IAppDbContext db, ICurrentUser caller, IPasswordHasherService hasher, IClock clock, CancellationToken ct) =>
        {
            var user = await db.Users.SingleAsync(u => u.Id == caller.UserId, ct);
            if (!hasher.Verify(request.Password ?? "", user.PasswordHash) || user.EmailVerifiedAt is null)
                throw new BusinessValidationException("Verify your email and enter your current password first.");
            await AccountCodes.RequireAsync(db, user.Id, request.Code, clock, ct);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            user.MfaEnabled = request.Enabled;
            await db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.SecurityVersion, u => u.SecurityVersion + 1), ct);
            await db.RefreshTokens.Where(t => t.UserId == user.Id && t.RevokedAtUtc == null).ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, clock.UtcNow), ct);
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.NoContent();
        }).RequireRateLimiting("auth");
        group.MapPost("/revoke-sessions", async (IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Users.Where(u => u.Id == caller.UserId).ExecuteUpdateAsync(s => s.SetProperty(u => u.SecurityVersion, u => u.SecurityVersion + 1), ct);
            await db.RefreshTokens.Where(t => t.UserId == caller.UserId && t.RevokedAtUtc == null).ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, clock.UtcNow), ct);
            await tx.CommitAsync(ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");
        group.MapPost("/verification", async (IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            var user = await db.Users.SingleAsync(u => u.Id == caller.UserId, ct);
            if (user.EmailVerifiedAt is not null) return Results.NoContent();
            var recent = await db.AccountChallenges.AnyAsync(c => c.UserId == user.Id && c.Purpose == "verify-email" && c.ExpiresAt > clock.UtcNow.AddMinutes(9), ct);
            if (recent) return Results.NoContent();
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            db.AccountChallenges.Add(new AccountChallenge { UserId = user.Id, TokenHash = Hash(token), ExpiresAt = clock.UtcNow.AddMinutes(10) });
            db.EmailDeliveries.Add(new EmailDelivery { Key = $"verify-email:{Guid.NewGuid():N}", Recipient = user.Email, Subject = "Verify your NineCube email",
                Body = $"<p>Your verification token is <strong>{token}</strong>. It expires in ten minutes.</p>", CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");
        group.MapPost("/verification/confirm", async (SecurityCodeRequest request, IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            var hash = Hash(request.Code ?? "");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var count = await db.AccountChallenges.Where(c => c.UserId == caller.UserId && c.Purpose == "verify-email" && c.TokenHash == hash && c.UsedAt == null && c.ExpiresAt > clock.UtcNow)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedAt, clock.UtcNow), ct);
            if (count != 1) throw new BusinessValidationException("Verification token is invalid or expired.");
            await db.Users.Where(u => u.Id == caller.UserId).ExecuteUpdateAsync(s => s.SetProperty(u => u.EmailVerifiedAt, clock.UtcNow), ct);
            await tx.CommitAsync(ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");
    }
    internal static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value.Trim())));
}
