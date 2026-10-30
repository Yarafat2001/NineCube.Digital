using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class BrandEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/brands")
            .WithTags("Brands")
            .RequireAuthorization(Policies.AnyAuthenticated);

        group.MapGet("/", GetBrandsAsync)
            .WithName("GetBrands")
            .WithSummary("Brand and series facets for the catalogue.");

        group.MapGet("/{slug}/lines", GetBrandLinesAsync)
            .WithName("GetBrandLines")
            .WithSummary("The series of one brand, with facet counting rules.");
    }

    public static async Task<Results<Ok<IReadOnlyList<BrandDto>>, ProblemHttpResult>> GetBrandsAsync(
        [FromQuery] string? q,
        [FromQuery] bool? isActive,
        [FromQuery] int? categoryId = null,
        [FromQuery] string? categorySlug = null,
        [FromQuery] bool includeDescendants = true,
        [FromQuery] string? tag = null,
        [FromQuery] bool? inStock = null,
        [FromQuery] decimal? minPrice = null,
        [FromQuery] decimal? maxPrice = null,
        [FromQuery] string sort = "name",
        ICatalogService catalog = null!,
        CancellationToken ct = default)
    {
        var filters = new CatalogFilters(categoryId, categorySlug, includeDescendants, tag, inStock, minPrice, maxPrice, sort);
        var brands = await catalog.BrandsAsync(q, isActive, filters, ct);
        return TypedResults.Ok(brands);
    }

    public static async Task<Results<Ok<BrandLinesDto>, ProblemHttpResult>> GetBrandLinesAsync(
        string slug,
        [FromQuery] string? q,
        [FromQuery] bool? isActive,
        [FromQuery] int? categoryId = null,
        [FromQuery] string? categorySlug = null,
        [FromQuery] bool includeDescendants = true,
        [FromQuery] string? tag = null,
        [FromQuery] bool? inStock = null,
        [FromQuery] decimal? minPrice = null,
        [FromQuery] decimal? maxPrice = null,
        [FromQuery] string sort = "name",
        ICatalogService catalog = null!,
        CancellationToken ct = default)
    {
        var filters = new CatalogFilters(categoryId, categorySlug, includeDescendants, tag, inStock, minPrice, maxPrice, sort);
        var lines = await catalog.LinesAsync(slug, q, isActive, filters, ct);
        return TypedResults.Ok(lines);
    }
}
