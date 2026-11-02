using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Tests.Infrastructure;

/// <summary>
/// The ambient caller for services built by hand in tests. UserId is settable because the approval
/// scenarios are entirely about which administrator is standing at the keyboard.
/// </summary>
public sealed class TestCurrentUser : ICurrentUser
{
    public int? UserId { get; set; } = 1;
    public string? Email { get; set; } = "admin@ninecube.demo";
    public UserRole? Role { get; set; } = UserRole.Administrator;

    public bool IsAuthenticated => UserId.HasValue;
    public int? CustomerId => null;

    public bool IsInRole(params UserRole[] roles) => Role.HasValue && roles.Contains(Role.Value);
}
