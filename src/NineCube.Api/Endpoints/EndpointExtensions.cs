using System.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace NineCube.Api.Endpoints;

public static class EndpointExtensions
{
    /// <summary>
    /// Scans the target assembly for all non-abstract <see cref="IEndpoint"/> implementations
    /// and executes their route registration against the web application.
    /// </summary>
    public static WebApplication MapEndpoints(this WebApplication app, Assembly? assembly = null)
    {
        assembly ??= typeof(Program).Assembly;

        var endpointTypes = assembly.GetTypes()
            .Where(t => !t.IsAbstract && !t.IsInterface && typeof(IEndpoint).IsAssignableFrom(t));

        foreach (var type in endpointTypes)
        {
            var endpoint = (IEndpoint)Activator.CreateInstance(type)!;
            endpoint.MapEndpoint(app);
        }

        return app;
    }
}
