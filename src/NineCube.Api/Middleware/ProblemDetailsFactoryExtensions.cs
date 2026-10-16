using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Middleware;

public static class ProblemDetailsFactoryExtensions
{
    public const string ProblemBaseUri = "https://ninecube.digital/problems/";

    public static Task WriteProblemAsync(
        HttpContext context,
        int status,
        string code,
        string title,
        string detail,
        Action<ProblemDetails>? customize = null)
    {
        var problem = new ProblemDetails
        {
            Type = ProblemBaseUri + code,
            Title = title,
            Status = status,
            Detail = detail,
            Instance = context.Request.Path
        };

        problem.Extensions["code"] = code;
        problem.Extensions["correlationId"] = CorrelationIdMiddleware.Get(context);

        customize?.Invoke(problem);

        if (context.Response.HasStarted) return Task.CompletedTask;

        context.Response.StatusCode = status;

        return context.RequestServices
            .GetRequiredService<IProblemDetailsService>()
            .WriteAsync(new ProblemDetailsContext { HttpContext = context, ProblemDetails = problem })
            .AsTask();
    }

    /// <summary>
    /// Turns 401/403 produced by the authentication/authorization middleware into the same
    /// ProblemDetails shape the services use, so a client only ever parses one error format.
    /// </summary>
    public static IServiceCollection ConfigureAuthenticationProblemDetails(this IServiceCollection services)
    {
        services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            options.Events ??= new JwtBearerEvents();

            options.Events.OnChallenge = async context =>
            {
                context.HandleResponse();
                await WriteProblemAsync(
                    context.HttpContext,
                    StatusCodes.Status401Unauthorized,
                    "unauthenticated",
                    "Authentication required.",
                    "A valid access token is required to call this endpoint.");
            };

            options.Events.OnForbidden = async context =>
            {
                await WriteProblemAsync(
                    context.HttpContext,
                    StatusCodes.Status403Forbidden,
                    "forbidden",
                    "You do not have permission to perform this action.",
                    "Your role is not allowed to call this endpoint. Separation of duties is enforced server side.");
            };
        });

        return services;
    }
}
