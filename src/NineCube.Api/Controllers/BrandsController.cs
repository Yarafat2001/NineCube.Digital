using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Controllers;

/// <summary>
/// Brand and series facets for the catalogue. Both endpoints take the same filters as /api/products
/// (the brand/line parameters are ignored here on purpose) so every count equals the number of results
/// the shopper gets when they click that option.
/// </summary>
[Route("api/brands")]
[Produces("application/json")]
[Authorize(Policy = Policies.AnyAuthenticated)]
public sealed class BrandsController(ICatalogService catalog) : ApiControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<BrandDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<BrandDto>>> Get(
        [FromQuery] string? q, [FromQuery] bool? isActive,
        [FromQuery] int? categoryId = null, [FromQuery] string? categorySlug = null,
        [FromQuery] bool includeDescendants = true, [FromQuery] string? tag = null,
        [FromQuery] bool? inStock = null, [FromQuery] decimal? minPrice = null,
        [FromQuery] decimal? maxPrice = null, [FromQuery] string sort = "name",
        CancellationToken ct = default) =>
        Ok(await catalog.BrandsAsync(q, isActive, Facets(categoryId, categorySlug, includeDescendants, tag, inStock, minPrice, maxPrice, sort), ct));

    /// <summary>The series of one brand, with the same counting rule.</summary>
    [HttpGet("{slug}/lines")]
    [ProducesResponseType(typeof(BrandLinesDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<BrandLinesDto>> Lines(
        string slug,
        [FromQuery] string? q, [FromQuery] bool? isActive,
        [FromQuery] int? categoryId = null, [FromQuery] string? categorySlug = null,
        [FromQuery] bool includeDescendants = true, [FromQuery] string? tag = null,
        [FromQuery] bool? inStock = null, [FromQuery] decimal? minPrice = null,
        [FromQuery] decimal? maxPrice = null, [FromQuery] string sort = "name",
        CancellationToken ct = default) =>
        Ok(await catalog.LinesAsync(slug, q, isActive, Facets(categoryId, categorySlug, includeDescendants, tag, inStock, minPrice, maxPrice, sort), ct));

    private static CatalogFilters Facets(int? categoryId, string? categorySlug, bool includeDescendants, string? tag,
        bool? inStock, decimal? minPrice, decimal? maxPrice, string sort) =>
        new(categoryId, categorySlug, includeDescendants, tag, inStock, minPrice, maxPrice, sort);
}
