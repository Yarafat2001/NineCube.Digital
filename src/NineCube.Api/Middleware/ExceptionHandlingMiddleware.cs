using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Middleware;

/// <summary>
/// The single place where an exception becomes an HTTP response.
/// Business failures are never 500: they are the typed DomainExceptions, each of which already
/// knows its status code. Anything unmapped is a genuine bug and becomes a 500 with the
/// correlation id so it can be found in the logs.
/// </summary>
public sealed class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly ITransientErrorPolicy _errors;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger,
        ITransientErrorPolicy errors)
    {
        _next = next;
        _logger = logger;
        _errors = errors;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (InsufficientStockException ex)
        {
            _logger.LogInformation("Order rejected: insufficient stock for {Count} line(s)", ex.ShortItems.Count);

            await ProblemDetailsFactoryExtensions.WriteProblemAsync(
                context, ex.StatusCode, ex.Code, "Insufficient stock.", ex.Message,
                problem => problem.Extensions["shortItems"] = ex.ShortItems.Select(s => new
                {
                    productId = s.ProductId,
                    sku = s.Sku,
                    name = s.Name,
                    requested = s.Requested,
                    available = s.Available
                }).ToArray());
        }
        catch (InvalidStateTransitionException ex)
        {
            _logger.LogInformation("Rejected order status transition {From} -> {To}", ex.From, ex.To);

            await ProblemDetailsFactoryExtensions.WriteProblemAsync(
                context, ex.StatusCode, ex.Code, "Invalid order status transition.", ex.Message,
                problem =>
                {
                    problem.Extensions["currentStatus"] = ex.From.ToString();
                    problem.Extensions["attemptedStatus"] = ex.To.ToString();
                });
        }
        catch (BusinessValidationException ex)
        {
            await ProblemDetailsFactoryExtensions.WriteProblemAsync(
                context, ex.StatusCode, ex.Code, "The request is invalid.", ex.Message,
                problem => problem.Extensions["errors"] = ex.Errors);
        }
        catch (DomainException ex)
        {
            await ProblemDetailsFactoryExtensions.WriteProblemAsync(
                context, ex.StatusCode, ex.Code, TitleFor(ex), ex.Message);
        }
        catch (DbUpdateException ex) when (_errors.IsCheckConstraintViolation(ex))
        {
            // The CHECK constraint fired. This is the safety net behind the conditional updates -
            // if it ever triggers, the request is a conflict, not a server error.
            _logger.LogWarning(ex, "Database CHECK constraint rejected a write");

            await ProblemDetailsFactoryExtensions.WriteProblemAsync(
                context, 409, "constraint_violation", "The write violated a database constraint.",
                "The requested change would leave the data in an invalid state (for example negative stock).");
        }
        catch (DbUpdateException ex) when (_errors.IsUniqueViolation(ex))
        {
            _logger.LogWarning(ex, "Database unique constraint rejected a write");

            await ProblemDetailsFactoryExtensions.WriteProblemAsync(
                context, 409, "duplicate", "The write conflicts with an existing record.",
                "A record with the same unique value already exists.");
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // The caller went away; nothing useful to write.
            _logger.LogDebug("Request aborted by the client");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception for {Method} {Path}", context.Request.Method, context.Request.Path);

            await ProblemDetailsFactoryExtensions.WriteProblemAsync(
                context, 500, "internal_error", "An unexpected error occurred.",
                "The request could not be completed. Quote the correlationId when reporting this.");
        }
    }

    private static string TitleFor(DomainException ex) => ex switch
    {
        UnauthorizedException => "Not authenticated.",
        ForbiddenException => "Forbidden.",
        NotFoundException => "Not found.",
        ConflictException => "Conflict.",
        _ => "Request failed."
    };
}
