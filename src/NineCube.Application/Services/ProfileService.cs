using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IProfileService
{
    Task<ProfileDto> GetAsync(CancellationToken ct = default);
    Task<ProfileDto> UpdateAsync(UpdateProfileRequest request, CancellationToken ct = default);
    Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<AddressDto>> ListAddressesAsync(CancellationToken ct = default);
    Task<AddressDto> CreateAddressAsync(AddressRequest request, CancellationToken ct = default);
    Task<AddressDto> UpdateAddressAsync(int id, AddressRequest request, CancellationToken ct = default);
    Task DeleteAddressAsync(int id, CancellationToken ct = default);
}

/// <summary>
/// Self-service account data. Everything is keyed on the authenticated user's own id, so there is
/// no "check the caller against the row" step that could be forgotten; asking for somebody else's
/// address simply finds nothing and answers 404.
/// </summary>
public sealed class ProfileService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IClock clock,
    IPasswordHasherService hasher) : IProfileService
{
    public async Task<ProfileDto> GetAsync(CancellationToken ct = default)
    {
        var (user, customer) = await LoadAsync(ct);

        return new ProfileDto(
            user.Id,
            customer?.Name ?? user.Email,
            user.Email,
            customer?.Phone,
            user.Role,
            user.CreatedAt,
            customer is null ? [] : await AddressesOfAsync(customer.Id, ct));
    }

    public async Task<ProfileDto> UpdateAsync(UpdateProfileRequest request, CancellationToken ct = default)
    {
        var (user, customer) = await LoadAsync(ct);

        var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length is < 1 or > 200)
        {
            throw new BusinessValidationException(
                "Name is required and must be at most 200 characters.",
                new Dictionary<string, string[]> { ["name"] = new[] { "Name is required and must be at most 200 characters." } });
        }

        var phone = request.Phone?.Trim();
        if (phone is not null && phone.Length > 0 && !IsPlausiblePhone(phone))
        {
            throw new BusinessValidationException(
                "Use a phone number of 6 to 20 characters, digits, spaces, + and hyphens only.",
                new Dictionary<string, string[]> { ["phone"] = new[] { "Phone number is not valid." } });
        }

        if (customer is null)
        {
            // A staff login has no billing record; its display name lives on the user row's email only.
            throw new BusinessValidationException("This account has no customer profile to edit.");
        }

        customer.Name = name;
        customer.Phone = string.IsNullOrEmpty(phone) ? null : phone;

        db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = AuditActions.CustomerProfileUpdated,
            EntityType = nameof(Customer),
            EntityId = customer.Id.ToString(),
            CreatedAt = clock.UtcNow,
            Details = $"name={name}"
        });

        await db.SaveChangesAsync(ct);

        return await GetAsync(ct);
    }

    public async Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken ct = default)
    {
        var (user, _) = await LoadAsync(ct);

        if (!hasher.Verify(request.CurrentPassword ?? string.Empty, user.PasswordHash))
        {
            throw new BusinessValidationException(
                "The current password is not correct.",
                new Dictionary<string, string[]> { ["currentPassword"] = new[] { "The current password is not correct." } });
        }

        var next = request.NewPassword ?? string.Empty;
        if (next.Length is < 8 or > 128)
        {
            throw new BusinessValidationException(
                "A new password must be between 8 and 128 characters.",
                new Dictionary<string, string[]> { ["newPassword"] = new[] { "Use at least 8 characters." } });
        }

        if (hasher.Verify(next, user.PasswordHash))
        {
            throw new BusinessValidationException(
                "The new password must be different from the current one.",
                new Dictionary<string, string[]> { ["newPassword"] = new[] { "Choose a password you have not used here." } });
        }

        user.PasswordHash = hasher.Hash(next);

        db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = AuditActions.UserPasswordChanged,
            EntityType = nameof(User),
            EntityId = user.Id.ToString(),
            CreatedAt = clock.UtcNow,
            Details = "self-service change"
        });

        await db.SaveChangesAsync(ct);
    }

    // ------------------------------------------------------------------ addresses

    public async Task<IReadOnlyList<AddressDto>> ListAddressesAsync(CancellationToken ct = default)
    {
        var (_, customer) = await LoadAsync(ct);
        return customer is null ? [] : await AddressesOfAsync(customer.Id, ct);
    }

    public async Task<AddressDto> CreateAddressAsync(AddressRequest request, CancellationToken ct = default)
    {
        var (_, customer) = await LoadAsync(ct);
        if (customer is null) throw new BusinessValidationException("This account has no customer profile.");

        Validate(request);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var address = new Address
        {
            CustomerId = customer.Id,
            Label = request.Label.Trim(),
            Division = request.Division.Trim(),
            District = request.District.Trim(),
            Upazila = request.Upazila.Trim(),
            AddressLine = request.AddressLine.Trim(),
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            IsDefault = request.IsDefault,
            CreatedAt = clock.UtcNow
        };

        // The first address is the default whether or not the caller asked for it.
        if (!await db.Addresses.AnyAsync(a => a.CustomerId == customer.Id, ct)) address.IsDefault = true;

        db.Addresses.Add(address);
        // Only when this row claims the default: otherwise the customer's existing default stays.
        if (address.IsDefault) await ClearOtherDefaultsAsync(customer.Id, keepId: null, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await RequireAddressAsync(address.Id, customer.Id, ct);
    }

    public async Task<AddressDto> UpdateAddressAsync(int id, AddressRequest request, CancellationToken ct = default)
    {
        var (_, customer) = await LoadAsync(ct);
        if (customer is null) throw new BusinessValidationException("This account has no customer profile.");

        Validate(request);

        var address = await db.Addresses.FirstOrDefaultAsync(a => a.Id == id && a.CustomerId == customer.Id, ct)
            ?? throw new NotFoundException($"Address {id} was not found.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        address.Label = request.Label.Trim();
        address.Division = request.Division.Trim();
        address.District = request.District.Trim();
        address.Upazila = request.Upazila.Trim();
        address.AddressLine = request.AddressLine.Trim();
        address.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        address.IsDefault = request.IsDefault;

        if (address.IsDefault) await ClearOtherDefaultsAsync(customer.Id, keepId: id, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await RequireAddressAsync(id, customer.Id, ct);
    }

    public async Task DeleteAddressAsync(int id, CancellationToken ct = default)
    {
        var (_, customer) = await LoadAsync(ct);
        if (customer is null) throw new BusinessValidationException("This account has no customer profile.");

        var address = await db.Addresses.FirstOrDefaultAsync(a => a.Id == id && a.CustomerId == customer.Id, ct)
            ?? throw new NotFoundException($"Address {id} was not found.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var wasDefault = address.IsDefault;
        db.Addresses.Remove(address);
        await db.SaveChangesAsync(ct);

        // Losing the default must not leave the customer without one.
        if (wasDefault)
        {
            var successor = await db.Addresses
                .Where(a => a.CustomerId == customer.Id)
                .OrderBy(a => a.Id)
                .FirstOrDefaultAsync(ct);

            if (successor is not null) successor.IsDefault = true;
            await db.SaveChangesAsync(ct);
        }

        await tx.CommitAsync(ct);
    }

    /// <summary>
    /// Blanks every other default before the caller's row claims it: the filtered unique index
    /// allows exactly one row per customer, and the write order is the point.
    /// </summary>
    private async Task ClearOtherDefaultsAsync(int customerId, int? keepId, CancellationToken ct)
    {
        var others = db.Addresses.Where(a => a.CustomerId == customerId && a.IsDefault && (keepId == null || a.Id != keepId));
        if (!await others.AnyAsync(ct)) return;

        await others.ExecuteUpdateAsync(s => s.SetProperty(a => a.IsDefault, false), ct);
    }

    private async Task<AddressDto> RequireAddressAsync(int id, int customerId, CancellationToken ct)
    {
        var row = await db.Addresses.AsNoTracking()
            .Where(a => a.Id == id && a.CustomerId == customerId)
            .Select(a => new { a.Id, a.Label, a.Division, a.District, a.Upazila, a.AddressLine, a.Phone, a.IsDefault })
            .FirstOrDefaultAsync(ct);

        if (row is null) throw new NotFoundException($"Address {id} was not found.");

        return new AddressDto(row.Id, row.Label, row.Division, row.District, row.Upazila, row.AddressLine, row.Phone, row.IsDefault);
    }

    private async Task<IReadOnlyList<AddressDto>> AddressesOfAsync(int customerId, CancellationToken ct)
    {
        var rows = await db.Addresses.AsNoTracking()
            .Where(a => a.CustomerId == customerId)
            .OrderByDescending(a => a.IsDefault).ThenBy(a => a.Id)
            .Select(a => new { a.Id, a.Label, a.Division, a.District, a.Upazila, a.AddressLine, a.Phone, a.IsDefault })
            .ToListAsync(ct);

        return rows
            .Select(r => new AddressDto(r.Id, r.Label, r.Division, r.District, r.Upazila, r.AddressLine, r.Phone, r.IsDefault))
            .ToList();
    }

    private static void Validate(AddressRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        void Required(string key, string? value, int max, string label)
        {
            var trimmed = value?.Trim() ?? string.Empty;
            if (trimmed.Length == 0) errors[key] = [$"{label} is required."];
            else if (trimmed.Length > max) errors[key] = [$"{label} must be at most {max} characters."];
        }

        Required("label", request.Label, 60, "Label");
        Required("division", request.Division, 80, "Division");
        Required("district", request.District, 80, "District");
        Required("upazila", request.Upazila, 80, "Upazila");
        Required("addressLine", request.AddressLine, 300, "Address line");

        var phone = request.Phone?.Trim() ?? string.Empty;
        if (phone.Length > 0 && !IsPlausiblePhone(phone)) errors["phone"] = ["Phone number is not valid."];

        if (errors.Count > 0) throw new BusinessValidationException("The address is incomplete.", errors);
    }

    private static bool IsPlausiblePhone(string value) =>
        value.Length is >= 6 and <= 20 && value.All(c => char.IsDigit(c) || c is ' ' or '+' or '-' or ')');

    private async Task<(User User, Customer? Customer)> LoadAsync(CancellationToken ct)
    {
        var userId = currentUser.UserId ?? throw new UnauthorizedException("Not authenticated.");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new UnauthorizedException("The authenticated account no longer exists.");

        var customer = user.CustomerId is int customerId
            ? await db.Customers.FirstOrDefaultAsync(c => c.Id == customerId, ct)
            : null;

        return (user, customer);
    }
}
