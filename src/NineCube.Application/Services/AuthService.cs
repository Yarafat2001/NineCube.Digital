using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default);
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<UserSummaryDto> GetMeAsync(CancellationToken ct = default);
    Task<AuthResponse> RefreshTokenAsync(string refreshToken, CancellationToken ct = default);
    Task RevokeTokenAsync(string refreshToken, CancellationToken ct = default);
}

public sealed class AuthService : IAuthService
{
    private readonly IAppDbContext _db;
    private readonly IPasswordHasherService _hasher;
    private readonly IJwtTokenService _tokens;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;
    private readonly SecurityOptions _securityOptions;

    public AuthService(
        IAppDbContext db,
        IPasswordHasherService hasher,
        IJwtTokenService tokens,
        ICurrentUser currentUser,
        IClock clock, Microsoft.Extensions.Options.IOptions<SecurityOptions>? securityOptions = null)
    {
        _db = db;
        _hasher = hasher;
        _tokens = tokens;
        _currentUser = currentUser;
        _clock = clock;
        _securityOptions = securityOptions?.Value ?? new();
    }

    /// <summary>
    /// Self-service registration always produces a Customer. There is no way for a caller to
    /// choose their own role, and the role is not read from the request body at all.
    /// </summary>
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        var email = Normalize(request.Email);

        if (await _db.Users.AnyAsync(u => u.Email == email, ct))
            throw new ResourceConflictException("An account with this email already exists.", "duplicate_email");

        var now = _clock.UtcNow;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var customer = new Customer
        {
            Name = request.Name.Trim(),
            Email = email,
            CreatedAt = now
        };
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(ct);

        var user = new User
        {
            Email = email,
            PasswordHash = _hasher.Hash(request.Password),
            Role = UserRole.Customer,
            IsActive = true,
            CustomerId = customer.Id,
            CreatedAt = now
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = AuditActions.UserRegistered,
            EntityType = nameof(User),
            EntityId = user.Id.ToString(),
            CreatedAt = now,
            Details = "role=Customer; self-registration"
        });
        await _db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        var token = _tokens.CreateAccessToken(user);
        var refreshToken = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(64));
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            Token = refreshToken,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddDays(14)
        });
        await _db.SaveChangesAsync(ct);

        return new AuthResponse(token.AccessToken, token.ExpiresAtUtc,
            new UserSummaryDto(user.Id, user.Email, user.Role, user.CustomerId), refreshToken);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var email = Normalize(request.Email);
        await using var loginTx = await _db.Database.BeginTransactionAsync(ct);
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Users\" WHERE \"Email\" = {email} FOR UPDATE", ct);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

        var ok = user is not null && _hasher.Verify(request.Password, user.PasswordHash);

        if (!ok || user is null)
        {
            // Failed attempts are audited too, but never with a password or a password hint.
            _db.AuditLogs.Add(new AuditLog
            {
                UserId = null,
                Action = AuditActions.UserLoginFailed,
                EntityType = nameof(User),
                EntityId = null,
                CreatedAt = _clock.UtcNow,
                Details = $"email={email}"
            });
            await _db.SaveChangesAsync(ct);

            throw new UnauthorizedException("Invalid email or password.");
        }

        if (!user.IsActive)
        {
            throw new UnauthorizedException("This account has been deactivated. Contact an administrator.");
        }

        if (user.MfaEnabled || (_securityOptions.RequireStaffMfa && user.Role != UserRole.Customer))
        {
            try { await AccountCodes.RequireAsync(_db, user.Id, request.Code, _clock, ct); }
            catch (UnauthorizedException) { await loginTx.CommitAsync(ct); throw; }
        }

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = AuditActions.UserLoggedIn,
            EntityType = nameof(User),
            EntityId = user.Id.ToString(),
            CreatedAt = _clock.UtcNow,
            Details = $"role={user.Role}"
        });
        await _db.SaveChangesAsync(ct);

        var token = _tokens.CreateAccessToken(user);
        var refreshToken = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(64));
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            Token = refreshToken,
            CreatedAtUtc = _clock.UtcNow,
            ExpiresAtUtc = _clock.UtcNow.AddDays(14)
        });
        await _db.SaveChangesAsync(ct);

        await loginTx.CommitAsync(ct);

        return new AuthResponse(token.AccessToken, token.ExpiresAtUtc,
            new UserSummaryDto(user.Id, user.Email, user.Role, user.CustomerId), refreshToken);
    }

    public async Task<UserSummaryDto> GetMeAsync(CancellationToken ct = default)
    {
        var id = _currentUser.UserId ?? throw new UnauthorizedException("Not authenticated.");

        var user = await _db.Users.AsNoTracking()
            .Where(u => u.Id == id)
            .Select(u => new UserSummaryDto(u.Id, u.Email, u.Role, u.CustomerId))
            .FirstOrDefaultAsync(ct);

        return user ?? throw new UnauthorizedException("The authenticated account no longer exists.");
    }

    internal static string Normalize(string email) => email.Trim().ToLowerInvariant();

    public async Task<AuthResponse> RefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            throw new UnauthorizedException("Refresh token is required.");

        var existing = await _db.RefreshTokens
            .AsNoTracking()
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == refreshToken, ct);

        if (existing is not null && existing.RevokedAtUtc is not null && existing.ReplacedByToken is not null)
        {
            await _db.RefreshTokens.Where(t => t.UserId == existing.UserId && t.RevokedAtUtc == null)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, _clock.UtcNow), ct);
            throw new UnauthorizedException("A rotated refresh token was reused. Sign in again.");
        }
        if (existing is null || existing.RevokedAtUtc is not null || existing.ExpiresAtUtc <= _clock.UtcNow)
            throw new UnauthorizedException("Invalid, expired, or revoked refresh token.");

        if (existing.User is null || !existing.User.IsActive)
            throw new UnauthorizedException("This account is no longer active.");

        var now = _clock.UtcNow;
        var newRefreshToken = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(64));

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Users\" WHERE \"Id\" = {existing.UserId} FOR UPDATE", ct);
        await _db.ChangeTracker.Entries<User>().Single(e => e.Entity == existing.User).ReloadAsync(ct);
        var rotated = await _db.RefreshTokens.Where(t => t.Id == existing.Id && t.RevokedAtUtc == null && t.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, now).SetProperty(t => t.ReplacedByToken, newRefreshToken), ct);
        if (rotated != 1) throw new UnauthorizedException("This session was already refreshed. Sign in again.");

        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = existing.UserId,
            Token = newRefreshToken,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddDays(14)
        });

        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        var token = _tokens.CreateAccessToken(existing.User);
        return new AuthResponse(token.AccessToken, token.ExpiresAtUtc,
            new UserSummaryDto(existing.User.Id, existing.User.Email, existing.User.Role, existing.User.CustomerId),
            newRefreshToken);
    }

    public async Task RevokeTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return;

        var token = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.Token == refreshToken, ct);
        if (token is not null && token.RevokedAtUtc is null)
        {
            token.RevokedAtUtc = _clock.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
    }

}
