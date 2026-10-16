using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Controllers;

[Route("api/admin")]
[Produces("application/json")]
[Authorize(Policy = Policies.AdministratorOnly)]
public sealed class AdminController : ApiControllerBase
{
    private readonly IAdminService _admin;
    private readonly IValidator<CreateUserRequest> _createUserValidator;
    private readonly IValidator<ChangeUserRoleRequest> _changeRoleValidator;
    private readonly IValidator<SettingsDto> _settingsValidator;

    public AdminController(
        IAdminService admin,
        IValidator<CreateUserRequest> createUserValidator,
        IValidator<ChangeUserRoleRequest> changeRoleValidator,
        IValidator<SettingsDto> settingsValidator)
    {
        _admin = admin;
        _createUserValidator = createUserValidator;
        _changeRoleValidator = changeRoleValidator;
        _settingsValidator = settingsValidator;
    }

    [HttpGet("users")]
    [ProducesResponseType(typeof(PagedResult<AdminUserDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<AdminUserDto>>> ListUsers(
        [FromQuery] string? q,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default) =>
        Ok(await _admin.ListUsersAsync(q, page, pageSize, ct));

    [HttpPost("users")]
    [ProducesResponseType(typeof(AdminUserDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AdminUserDto>> CreateUser([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        await ValidateAsync(_createUserValidator, request, ct);
        var user = await _admin.CreateUserAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created, user);
    }

    /// <summary>Changing a role takes effect immediately, including on tokens that are already issued.</summary>
    [HttpPut("users/{id:int}/role")]
    [ProducesResponseType(typeof(AdminUserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AdminUserDto>> ChangeRole(int id, [FromBody] ChangeUserRoleRequest request, CancellationToken ct)
    {
        await ValidateAsync(_changeRoleValidator, request, ct);
        return Ok(await _admin.ChangeRoleAsync(id, request.Role, ct));
    }

    [HttpPut("users/{id:int}/active")]
    [ProducesResponseType(typeof(AdminUserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AdminUserDto>> SetActive(int id, [FromBody] SetUserActiveRequest request, CancellationToken ct) =>
        Ok(await _admin.SetActiveAsync(id, request.IsActive, ct));

    [HttpGet("audit-logs")]
    [ProducesResponseType(typeof(PagedResult<AuditLogDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<AuditLogDto>>> AuditLogs(
        [FromQuery] string? action,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default) =>
        Ok(await _admin.ListAuditLogsAsync(action, page, pageSize, ct));

    [HttpGet("settings")]
    [ProducesResponseType(typeof(SettingsDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<SettingsDto>> GetSettings(CancellationToken ct) =>
        Ok(await _admin.GetSettingsAsync(ct));

    [HttpPut("settings")]
    [ProducesResponseType(typeof(SettingsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SettingsDto>> UpdateSettings([FromBody] SettingsDto settings, CancellationToken ct)
    {
        await ValidateAsync(_settingsValidator, settings, ct);
        return Ok(await _admin.UpdateSettingsAsync(settings, ct));
    }
}
