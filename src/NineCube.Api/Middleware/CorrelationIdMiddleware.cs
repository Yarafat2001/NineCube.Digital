using Serilog.Context;

namespace NineCube.Api.Middleware;

/// <summary>
/// Every request gets a correlation id: taken from the caller when supplied, generated when not.
/// It is echoed back on the response and pushed into the Serilog context, so a ProblemDetails a
/// reviewer pastes into a ticket can be traced to the exact log lines.
/// </summary>
public sealed class CorrelationIdMiddleware
{
    public const string HeaderName = "X-Correlation-Id";
    public const string ItemsKey = "CorrelationId";

    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers.TryGetValue(HeaderName, out var supplied)
            && !string.IsNullOrWhiteSpace(supplied.ToString())
                ? supplied.ToString()
                : Guid.NewGuid().ToString("N");

        context.Items[ItemsKey] = correlationId;
        context.Response.Headers[HeaderName] = correlationId;

        using (LogContext.PushProperty("CorrelationId", correlationId))
        {
            await _next(context);
        }
    }

    public static string Get(HttpContext context) =>
        context.Items.TryGetValue(ItemsKey, out var value) ? value?.ToString() ?? string.Empty : string.Empty;
}
