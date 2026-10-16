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
}

public sealed class AuthService : IAuthService
{
    private readonly IAppDbContext _db;
    private readonly IPasswordHasherService _hasher;
    private readonly IJwtTokenService _tokens;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;

    public AuthService(
        IAppDbContext db,
        IPasswordHasherService hasher,
        IJwtTokenService tokens,
        ICurrentUser currentUser,
        IClock clock)
    {
        _db = db;
        _hasher = hasher;
        _tokens = tokens;
        _currentUser = currentUser;
        _clock = clock;
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
        return new AuthResponse(token.AccessToken, token.ExpiresAtUtc,
            new UserSummaryDto(user.Id, user.Email, user.Role, user.CustomerId));
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var email = Normalize(request.Email);
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
        return new AuthResponse(token.AccessToken, token.ExpiresAtUtc,
            new UserSummaryDto(user.Id, user.Email, user.Role, user.CustomerId));
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
}
