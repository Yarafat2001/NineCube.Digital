using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Application.Services;

public sealed class SecurityOptions { public bool RequireStaffMfa { get; set; } }
public static class AccountCodes
{
    private static string Hash(int id, int userId, string code) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{id}:{userId}:{code.Trim()}")));
    public static async Task SendAsync(IAppDbContext db, User user, IClock clock, CancellationToken ct)
    {
        if (await db.AccountChallenges.AnyAsync(c => c.UserId == user.Id && c.Purpose == "signin-code" && c.ExpiresAt > clock.UtcNow.AddMinutes(9), ct)) return;
        var code = RandomNumberGenerator.GetInt32(1000000).ToString("D6");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var challenge = new AccountChallenge { UserId = user.Id, Purpose = "signin-code", TokenHash = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)), ExpiresAt = clock.UtcNow.AddMinutes(10) };
        db.AccountChallenges.Add(challenge); await db.SaveChangesAsync(ct);
        challenge.TokenHash = Hash(challenge.Id, user.Id, code);
        db.EmailDeliveries.Add(new EmailDelivery { Key = $"signin-code:{challenge.Id}", Recipient = user.Email, Subject = "Your NineCube sign-in code",
            Body = $"<p>Your sign-in code is <strong>{code}</strong>. It expires in ten minutes and can be used once.</p>", CreatedAt = clock.UtcNow });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public static async Task RequireAsync(IAppDbContext db, int userId, string? code, IClock clock, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new BusinessValidationException("Request and enter your email sign-in code.", new Dictionary<string, string[]> { ["code"] = ["Enter the sign-in code sent to your email."] });
        var challenge = await db.AccountChallenges.AsNoTracking().Where(c => c.UserId == userId && c.Purpose == "signin-code" && c.UsedAt == null && c.ExpiresAt > clock.UtcNow && c.Attempts < 5)
            .OrderByDescending(c => c.Id).FirstOrDefaultAsync(ct);
        if (challenge is null) throw new UnauthorizedException("Sign-in code is invalid or expired.");
        if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(challenge.TokenHash), Convert.FromHexString(Hash(challenge.Id, userId, code))))
        {
            await db.AccountChallenges.Where(c => c.Id == challenge.Id && c.UsedAt == null).ExecuteUpdateAsync(s => s.SetProperty(c => c.Attempts, c => c.Attempts + 1), ct);
            throw new UnauthorizedException("Sign-in code is invalid or expired.");
        }
        var consumed = await db.AccountChallenges.Where(c => c.Id == challenge.Id && c.UsedAt == null && c.Attempts < 5 && c.ExpiresAt > clock.UtcNow)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedAt, clock.UtcNow), ct);
        if (consumed != 1) throw new UnauthorizedException("Sign-in code is invalid or expired.");
    }
}
