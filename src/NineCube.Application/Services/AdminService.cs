using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IAdminService
{
    Task<PagedResult<AdminUserDto>> ListUsersAsync(string? search, int page, int pageSize, CancellationToken ct = default);
    Task<AdminUserDto> CreateUserAsync(CreateUserRequest request, CancellationToken ct = default);
    Task<AdminUserDto> ChangeRoleAsync(int userId, UserRole role, CancellationToken ct = default);
    Task<AdminUserDto> SetActiveAsync(int userId, bool isActive, CancellationToken ct = default);
    Task<PagedResult<AuditLogDto>> ListAuditLogsAsync(string? action, int page, int pageSize, CancellationToken ct = default);
    Task<SettingsDto> GetSettingsAsync(CancellationToken ct = default);
    Task<SettingsDto> UpdateSettingsAsync(SettingsDto settings, CancellationToken ct = default);
}

public sealed class AdminService : IAdminService
{
    private readonly IAppDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;
    private readonly IPasswordHasherService _hasher;
    private readonly ISettingsService _settings;
    private readonly ICacheService _cache;

    public AdminService(
        IAppDbContext db,
        ICurrentUser currentUser,
        IClock clock,
        IPasswordHasherService hasher,
        ISettingsService settings,
        ICacheService cache)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
        _hasher = hasher;
        _settings = settings;
        _cache = cache;
    }

    public async Task<PagedResult<AdminUserDto>> ListUsersAsync(string? search, int page, int pageSize, CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 200 ? 50 : pageSize;

        var query = _db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(u => u.Email.Contains(term));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(u => u.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new AdminUserDto(u.Id, u.Email, u.Role, u.IsActive, u.CustomerId, u.CreatedAt))
            .ToListAsync(ct);

        return new PagedResult<AdminUserDto>(items, page, pageSize, total);
    }

    public async Task<AdminUserDto> CreateUserAsync(CreateUserRequest request, CancellationToken ct = default)
    {
        var email = AuthService.Normalize(request.Email);

        if (await _db.Users.AnyAsync(u => u.Email == email, ct))
            throw new ResourceConflictException("An account with this email already exists.", "duplicate_email");

        var now = _clock.UtcNow;
        int? customerId = null;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        if (request.Role == UserRole.Customer)
        {
            var name = string.IsNullOrWhiteSpace(request.Name) ? email.Split('@')[0] : request.Name!.Trim();
            var customer = new Customer { Name = name, Email = email, CreatedAt = now };
            _db.Customers.Add(customer);
            await _db.SaveChangesAsync(ct);
            customerId = customer.Id;
        }

        var user = new User
        {
            Email = email,
            PasswordHash = _hasher.Hash(request.Password),
            Role = request.Role,
            IsActive = true,
            CustomerId = customerId,
            CreatedAt = now
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = AuditActions.UserCreated,
            EntityType = nameof(User),
            EntityId = user.Id.ToString(),
            CreatedAt = now,
            Details = $"email={email}; role={request.Role}"
        });
        await _db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        return new AdminUserDto(user.Id, user.Email, user.Role, user.IsActive, user.CustomerId, user.CreatedAt);
    }

    public async Task<AdminUserDto> ChangeRoleAsync(int userId, UserRole role, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException($"User {userId} was not found.");

        if (user.Role == role) return Map(user);

        if (user.Role == UserRole.Administrator)
            await GuardLastActiveAdministratorAsync(userId, "change the role of", ct);

        var previous = user.Role;
        user.Role = role;

        // A Customer-role user must stay linked to a customer record, otherwise their order
        // history and "place an order" capability would be orphaned.
        if (role == UserRole.Customer && user.CustomerId is null)
        {
            var customer = new Customer
            {
                Name = user.Email.Split('@')[0],
                Email = user.Email,
                CreatedAt = _clock.UtcNow
            };
            _db.Customers.Add(customer);
            await _db.SaveChangesAsync(ct);
            user.CustomerId = customer.Id;
        }

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = AuditActions.UserRoleChanged,
            EntityType = nameof(User),
            EntityId = user.Id.ToString(),
            CreatedAt = _clock.UtcNow,
            Details = $"{previous} -> {role}"
        });

        await _db.SaveChangesAsync(ct);
        _cache.Remove($"auth:user:{userId}");
        return Map(user);
    }

    public async Task<AdminUserDto> SetActiveAsync(int userId, bool isActive, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException($"User {userId} was not found.");

        if (!isActive && _currentUser.UserId == userId)
            throw new ResourceConflictException("You cannot deactivate your own administrator account.", "self_deactivation");

        if (!isActive && user.Role == UserRole.Administrator)
            await GuardLastActiveAdministratorAsync(userId, "deactivate", ct);

        user.IsActive = isActive;

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = isActive ? AuditActions.UserActivated : AuditActions.UserDeactivated,
            EntityType = nameof(User),
            EntityId = user.Id.ToString(),
            CreatedAt = _clock.UtcNow,
            Details = $"isActive={isActive}"
        });

        await _db.SaveChangesAsync(ct);
        _cache.Remove($"auth:user:{userId}");
        return Map(user);
    }

    public async Task<PagedResult<AuditLogDto>> ListAuditLogsAsync(string? action, int page, int pageSize, CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 200 ? 50 : pageSize;

        var query = _db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(action))
        {
            var prefix = action.Trim();
            query = query.Where(a => a.Action.StartsWith(prefix));
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AuditLogDto(
                a.Id,
                a.UserId,
                a.UserId == null ? null : _db.Users.Where(u => u.Id == a.UserId).Select(u => u.Email).FirstOrDefault(),
                a.Action,
                a.EntityType,
                a.EntityId,
                a.CreatedAt,
                a.Details))
            .ToListAsync(ct);

        return new PagedResult<AuditLogDto>(items, page, pageSize, total);
    }

    public async Task<SettingsDto> GetSettingsAsync(CancellationToken ct = default)
        => new(await _settings.GetLowStockThresholdAsync(ct));

    public async Task<SettingsDto> UpdateSettingsAsync(SettingsDto settings, CancellationToken ct = default)
    {
        var before = await _settings.GetLowStockThresholdAsync(ct);
        await _settings.SetLowStockThresholdAsync(settings.LowStockThreshold, ct);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = AuditActions.SettingsUpdated,
            EntityType = nameof(Setting),
            EntityId = SettingKeys.LowStockThreshold,
            CreatedAt = _clock.UtcNow,
            Details = $"{before} -> {settings.LowStockThreshold}"
        });
        await _db.SaveChangesAsync(ct);
        _cache.Remove("settings:low_stock_threshold");

        return new SettingsDto(settings.LowStockThreshold);
    }

    private async Task GuardLastActiveAdministratorAsync(int userId, string verb, CancellationToken ct)
    {
        var otherActiveAdmins = await _db.Users
            .CountAsync(u => u.Id != userId && u.Role == UserRole.Administrator && u.IsActive, ct);

        if (otherActiveAdmins == 0)
            throw new ResourceConflictException(
                $"You cannot {verb} the last active administrator account.", "last_administrator");
    }

    private static AdminUserDto Map(User u) => new(u.Id, u.Email, u.Role, u.IsActive, u.CustomerId, u.CreatedAt);
}
