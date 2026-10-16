using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Controllers;

/// <summary>
/// Everything about the caller's own account: profile, password, delivery addresses and the
/// dashboard. There is deliberately no id in any of these routes - the identity comes from the
/// token, so "ask for somebody else's profile" is not a request this API can express.
/// </summary>
[Route("api/me")]
[Produces("application/json")]
[Authorize(Policy = Policies.AnyAuthenticated)]
public sealed class MeController : ApiControllerBase
{
    private readonly IProfileService _profile;
    private readonly IDashboardService _dashboard;
    private readonly IValidator<UpdateProfileRequest> _profileValidator;
    private readonly IValidator<ChangePasswordRequest> _passwordValidator;
    private readonly IValidator<AddressRequest> _addressValidator;

    public MeController(
        IProfileService profile,
        IDashboardService dashboard,
        IValidator<UpdateProfileRequest> profileValidator,
        IValidator<ChangePasswordRequest> passwordValidator,
        IValidator<AddressRequest> addressValidator)
    {
        _profile = profile;
        _dashboard = dashboard;
        _profileValidator = profileValidator;
        _passwordValidator = passwordValidator;
        _addressValidator = addressValidator;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ProfileDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProfileDto>> Get(CancellationToken ct) => Ok(await _profile.GetAsync(ct));

    [HttpPut]
    [ProducesResponseType(typeof(ProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ProfileDto>> Update([FromBody] UpdateProfileRequest request, CancellationToken ct)
    {
        await ValidateAsync(_profileValidator, request, ct);
        return Ok(await _profile.UpdateAsync(request, ct));
    }

    [HttpPut("password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        await ValidateAsync(_passwordValidator, request, ct);
        await _profile.ChangePasswordAsync(request, ct);
        return NoContent();
    }

    [HttpGet("dashboard")]
    [ProducesResponseType(typeof(DashboardDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<DashboardDto>> Dashboard(CancellationToken ct) =>
        Ok(await _dashboard.ForCurrentUserAsync(ct));

    [HttpGet("addresses")]
    [ProducesResponseType(typeof(IReadOnlyList<AddressDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AddressDto>>> Addresses(CancellationToken ct) =>
        Ok(await _profile.ListAddressesAsync(ct));

    [HttpPost("addresses")]
    [ProducesResponseType(typeof(AddressDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AddressDto>> CreateAddress([FromBody] AddressRequest request, CancellationToken ct)
    {
        await ValidateAsync(_addressValidator, request, ct);
        var address = await _profile.CreateAddressAsync(request, ct);
        return Created($"/api/me/addresses/{address.Id}", address);
    }

    [HttpPut("addresses/{id:int}")]
    [ProducesResponseType(typeof(AddressDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AddressDto>> UpdateAddress(int id, [FromBody] AddressRequest request, CancellationToken ct)
    {
        await ValidateAsync(_addressValidator, request, ct);
        return Ok(await _profile.UpdateAddressAsync(id, request, ct));
    }

    [HttpDelete("addresses/{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteAddress(int id, CancellationToken ct)
    {
        await _profile.DeleteAddressAsync(id, ct);
        return NoContent();
    }
}
