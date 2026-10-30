using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using NineCube.Api.Middleware;
using NineCube.Application.Common;

namespace NineCube.Api.Common;

public static class ResultExtensions
{
    public static ProblemHttpResult ToProblemResult(this Error error, HttpContext httpContext)
    {
        var extensions = new Dictionary<string, object?>
        {
            ["code"] = error.Code,
            ["correlationId"] = CorrelationIdMiddleware.Get(httpContext)
        };

        if (error.Details is not null)
        {
            extensions["errors"] = error.Details;
        }

        return TypedResults.Problem(
            statusCode: error.StatusCode,
            title: error.Message,
            detail: error.Message,
            type: ProblemDetailsFactoryExtensions.ProblemBaseUri + error.Code,
            instance: httpContext.Request.Path,
            extensions: extensions);
    }
}
