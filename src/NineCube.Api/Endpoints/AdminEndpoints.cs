using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Api.Common;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class AdminEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin")
            .WithTags("Admin")
            .RequireAuthorization(Policies.AdministratorOnly);

        group.MapGet("/users", ListUsersAsync)
            .WithName("AdminListUsers")
            .WithSummary("Lists registered users with pagination and search filter.");

        group.MapPost("/users", CreateUserAsync)
            .WithName("AdminCreateUser")
            .WithSummary("Creates a user with an assigned role.");

        group.MapPut("/users/{id:int}/role", ChangeRoleAsync)
            .WithName("AdminChangeUserRole")
            .WithSummary("Changes user role immediately, invalidating old permissions.");

        group.MapPut("/users/{id:int}/active", SetActiveAsync)
            .WithName("AdminSetUserActive")
            .WithSummary("Activates or deactivates a user account.");

        group.MapGet("/audit-logs", ListAuditLogsAsync)
            .WithName("AdminListAuditLogs")
            .WithSummary("Lists system audit logs.");

        group.MapGet("/settings", GetSettingsAsync)
            .WithName("AdminGetSettings")
            .WithSummary("Retrieves global application settings.");

        group.MapPut("/settings", UpdateSettingsAsync)
            .WithName("AdminUpdateSettings")
            .WithSummary("Updates global application settings.");
    }

    public static async Task<Results<Ok<PagedResult<AdminUserDto>>, ProblemHttpResult>> ListUsersAsync(
        [FromQuery] string? q,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        IAdminService admin = null!,
        CancellationToken ct = default)
    {
        var users = await admin.ListUsersAsync(q, page, pageSize, ct);
        return TypedResults.Ok(users);
    }

    public static async Task<Results<Created<AdminUserDto>, ProblemHttpResult>> CreateUserAsync(
        CreateUserRequest request,
        IAdminService admin,
        IValidator<CreateUserRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var user = await admin.CreateUserAsync(request, ct);
        return TypedResults.Created($"/api/admin/users/{user.Id}", user);
    }

    public static async Task<Results<Ok<AdminUserDto>, ProblemHttpResult>> ChangeRoleAsync(
        int id,
        ChangeUserRoleRequest request,
        IAdminService admin,
        IValidator<ChangeUserRoleRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var user = await admin.ChangeRoleAsync(id, request.Role, ct);
        return TypedResults.Ok(user);
    }

    public static async Task<Results<Ok<AdminUserDto>, ProblemHttpResult>> SetActiveAsync(
        int id,
        SetUserActiveRequest request,
        IAdminService admin,
        CancellationToken ct)
    {
        var user = await admin.SetActiveAsync(id, request.IsActive, ct);
        return TypedResults.Ok(user);
    }

    public static async Task<Results<Ok<PagedResult<AuditLogDto>>, ProblemHttpResult>> ListAuditLogsAsync(
        [FromQuery] string? action,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        IAdminService admin = null!,
        CancellationToken ct = default)
    {
        var logs = await admin.ListAuditLogsAsync(action, page, pageSize, ct);
        return TypedResults.Ok(logs);
    }

    public static async Task<Results<Ok<SettingsDto>, ProblemHttpResult>> GetSettingsAsync(
        IAdminService admin,
        CancellationToken ct)
    {
        var settings = await admin.GetSettingsAsync(ct);
        return TypedResults.Ok(settings);
    }

    public static async Task<Results<Ok<SettingsDto>, ProblemHttpResult>> UpdateSettingsAsync(
        SettingsDto settings,
        IAdminService admin,
        IValidator<SettingsDto> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, settings, ct);
        var updated = await admin.UpdateSettingsAsync(settings, ct);
        return TypedResults.Ok(updated);
    }
}
