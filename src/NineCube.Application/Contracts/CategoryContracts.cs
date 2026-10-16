namespace NineCube.Application.Contracts;

public sealed record CategoryCrumb(int Id, string Name, string Slug);
public sealed record CategoryDto(int Id, string Name, string Slug, int? ParentId, string Path, int Depth,
    int SortOrder, bool IsActive, int ProductCount, int InStockCount, int LowStockCount,
    int DirectProductCount, int DirectInStockCount, IReadOnlyList<CategoryCrumb> Breadcrumb, IReadOnlyList<CategoryDto> Children);
public sealed record CategoryRequest(string Name, string Slug, int? ParentId = null, int SortOrder = 0, bool IsActive = true);
public sealed record MoveCategoryRequest(int? ParentId, int? SortOrder = null);
public sealed record ProductCategoriesRequest(IReadOnlyList<int> CategoryIds, int? PrimaryCategoryId, IReadOnlyList<string>? Tags = null);
/// <summary>
/// A tag with the numbers the sidebar needs: <paramref name="ProductCount"/> is every product
/// carrying it, <paramref name="InStockCount"/> the buyable subset, so an "In-stock only" view can
/// show a count that agrees with the result list.
/// </summary>
public sealed record TagDto(int Id, string Name, int ProductCount, int InStockCount);
public sealed record ProductCategoryDto(int Id, string Name, string Slug, bool IsPrimary);

public sealed record BrandDto(int Id, string Name, string Slug, int ProductCount);
public sealed record ProductLineDto(int Id, string Name, string Slug, int SortOrder, int ProductCount);
public sealed record BrandLinesDto(int Id, string Name, string Slug, int ProductCount, IReadOnlyList<ProductLineDto> Lines);

/// <summary>
/// Catalogue facets. <paramref name="Brands"/> and <paramref name="Lines"/> are slug lists; a value
/// inside one facet is OR-ed with its siblings, facets are AND-ed together. A line always implies the
/// brand it belongs to, so combining them is only meaningful when they agree.
/// <paramref name="Tag"/> is either one tag name or a comma separated list, OR-ed the same way.
/// </summary>
public sealed record CatalogFilters(int? CategoryId = null, string? CategorySlug = null, bool IncludeDescendants = true,
    string? Tag = null, bool? InStock = null, decimal? MinPrice = null, decimal? MaxPrice = null, string Sort = "name",
    IReadOnlyList<string>? Brands = null, IReadOnlyList<string>? Lines = null);
