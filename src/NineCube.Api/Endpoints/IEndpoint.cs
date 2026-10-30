using Microsoft.AspNetCore.Routing;

namespace NineCube.Api.Endpoints;

/// <summary>
/// Defines a presentation endpoint module registered directly via Minimal APIs.
/// </summary>
public interface IEndpoint
{
    void MapEndpoint(IEndpointRouteBuilder app);
}
