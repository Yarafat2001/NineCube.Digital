using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IPasswordResetService
{
    Task<ForgotPasswordResponse> ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct = default);
    Task<bool> ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default);
}

public sealed class PasswordResetService : IPasswordResetService
{
    private readonly IAppDbContext _db;
    private readonly IClock _clock;
    private readonly IPasswordHasherService _hasher;
    private readonly ICacheService _cache;
    private readonly IEmailSender _emailSender;

    public PasswordResetService(
        IAppDbContext db,
        IClock clock,
        IPasswordHasherService hasher,
        ICacheService cache,
        IEmailSender emailSender)
    {
        _db = db;
        _clock = clock;
        _hasher = hasher;
        _cache = cache;
        _emailSender = emailSender;
    }

    public async Task<ForgotPasswordResponse> ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct = default)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail && u.IsActive, ct);

        // Security best practice: Always return generic message to prevent account enumeration.
        if (user is null)
        {
            return new ForgotPasswordResponse("If an active account with that email exists, reset instructions have been generated.");
        }

        // Generate cryptographically secure token
        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var resetToken = new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            ExpiresAtUtc = _clock.UtcNow.AddHours(1),
            CreatedAtUtc = _clock.UtcNow
        };

        _db.PasswordResetTokens.Add(resetToken);
        _db.EmailDeliveries.Add(new EmailDelivery
        {
            Key = $"password-reset:{Guid.NewGuid():N}", Recipient = user.Email,
            Subject = "Reset Your NineCube Password",
            Body = $"<p>Your password reset token is <strong>{rawToken}</strong>.</p><p>It expires in one hour. Ignore this message if you did not request it.</p>",
            CreatedAt = _clock.UtcNow
        });
        await _db.SaveChangesAsync(ct);
        return new ForgotPasswordResponse("If an active account with that email exists, reset instructions have been generated.");
    }

    public async Task<bool> ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Users\" WHERE lower(\"Email\") = {normalizedEmail} FOR UPDATE", ct);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail && u.IsActive, ct)
            ?? throw new ResourceConflictException("The password reset token is invalid, expired, or already used.", "invalid_reset_token");

        var rawToken = request.Token.Trim().ToLowerInvariant();
        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var now = _clock.UtcNow;
        var validToken = await _db.PasswordResetTokens
            .FirstOrDefaultAsync(t => t.UserId == user.Id && t.TokenHash == tokenHash && t.UsedAtUtc == null && t.ExpiresAtUtc > now, ct)
            ?? throw new ResourceConflictException("The password reset token is invalid, expired, or already used.", "invalid_reset_token");

        validToken.UsedAtUtc = now;
        user.PasswordHash = _hasher.Hash(request.NewPassword);
        user.SecurityVersion++;
        await _db.RefreshTokens.Where(t => t.UserId == user.Id && t.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, now), ct);
        await _db.PasswordResetTokens.Where(t => t.UserId == user.Id && t.UsedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAtUtc, now), ct);

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        _cache.Remove($"auth:user:{user.Id}");

        return true;
    }
}
