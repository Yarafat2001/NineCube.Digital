using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Api.Common;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class AuthEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth")
            .WithTags("Authentication");

        group.MapPost("/register", RegisterAsync)
            .AllowAnonymous()
            .WithName("Register")
            .WithSummary("Self-service registration. Always creates a Customer - the role is never taken from the body.");

        group.MapPost("/login", LoginAsync)
            .AllowAnonymous()
            .WithName("Login")
            .WithSummary("Authenticates a user and issues a JWT bearer token.");

        group.MapGet("/me", MeAsync)
            .RequireAuthorization(Policies.AnyAuthenticated)
            .WithName("GetMe")
            .WithSummary("Retrieves the currently authenticated user's summary.");
    }

    public static async Task<Results<Created<AuthResponse>, ProblemHttpResult>> RegisterAsync(
        RegisterRequest request,
        IAuthService auth,
        IValidator<RegisterRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var response = await auth.RegisterAsync(request, ct);
        return TypedResults.Created("/api/auth/me", response);
    }

    public static async Task<Results<Ok<AuthResponse>, ProblemHttpResult>> LoginAsync(
        LoginRequest request,
        IAuthService auth,
        IValidator<LoginRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var response = await auth.LoginAsync(request, ct);
        return TypedResults.Ok(response);
    }

    public static async Task<Results<Ok<UserSummaryDto>, ProblemHttpResult>> MeAsync(
        IAuthService auth,
        CancellationToken ct)
    {
        var user = await auth.GetMeAsync(ct);
        return TypedResults.Ok(user);
    }
}
