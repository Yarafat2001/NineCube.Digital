using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using NineCube.Application.Abstractions;
using NineCube.Domain;
using NineCube.Infrastructure.Identity;

namespace NineCube.Api.Auth;

public sealed class CurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;

    public CurrentUser(IHttpContextAccessor accessor) => _accessor = accessor;

    private ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public int? UserId =>
        int.TryParse(Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;

    public string? Email => Principal?.FindFirstValue(JwtRegisteredClaimNames.Email);

    public UserRole? Role =>
        Enum.TryParse<UserRole>(Principal?.FindFirstValue("role"), ignoreCase: false, out var role)
            ? role
            : null;

    public int? CustomerId =>
        int.TryParse(Principal?.FindFirstValue(JwtTokenService.CustomerIdClaim), out var id) ? id : null;

    public bool IsInRole(params UserRole[] roles) =>
        Role is { } current && roles.Contains(current);
}
