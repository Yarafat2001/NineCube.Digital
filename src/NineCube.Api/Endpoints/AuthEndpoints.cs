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
            .WithTags("Authentication")
            .RequireRateLimiting("auth");

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

        group.MapPost("/forgot-password", ForgotPasswordAsync)
            .AllowAnonymous()
            .WithName("ForgotPassword")
            .WithSummary("Generates a secure password reset token without leaking account existence.");

        group.MapPost("/reset-password", ResetPasswordAsync)
            .AllowAnonymous()
            .WithName("ResetPassword")
            .WithSummary("Verifies a reset token and updates the user's password.");

        group.MapPost("/refresh", RefreshAsync)
            .AllowAnonymous()
            .WithName("RefreshToken")
            .WithSummary("Exchanges an active refresh token for a new access token and rotated refresh token.");

        group.MapPost("/logout", LogoutAsync)
            .AllowAnonymous()
            .WithName("Logout")
            .WithSummary("Revokes an active refresh token upon sign out.");
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

    public static async Task<Results<Ok<ForgotPasswordResponse>, ProblemHttpResult>> ForgotPasswordAsync(
        ForgotPasswordRequest request,
        IPasswordResetService resetService,
        IValidator<ForgotPasswordRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var response = await resetService.ForgotPasswordAsync(request, ct);
        return TypedResults.Ok(response);
    }

    public static async Task<Results<Ok<object>, ProblemHttpResult>> ResetPasswordAsync(
        ResetPasswordRequest request,
        IPasswordResetService resetService,
        IValidator<ResetPasswordRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var success = await resetService.ResetPasswordAsync(request, ct);
        return TypedResults.Ok<object>(new { success, message = "Password has been successfully reset. You may now log in." });
    }

    public static async Task<Results<Ok<AuthResponse>, ProblemHttpResult>> RefreshAsync(
        RefreshTokenRequest request,
        IAuthService auth,
        CancellationToken ct)
    {
        var response = await auth.RefreshTokenAsync(request.RefreshToken, ct);
        return TypedResults.Ok(response);
    }

    public static async Task<Results<Ok<object>, ProblemHttpResult>> LogoutAsync(
        RefreshTokenRequest request,
        IAuthService auth,
        CancellationToken ct)
    {
        await auth.RevokeTokenAsync(request.RefreshToken, ct);
        return TypedResults.Ok<object>(new { success = true, message = "Session successfully logged out." });
    }

}
