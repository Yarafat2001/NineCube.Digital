using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface ICatalogService
{
    Task<PagedResult<ProductDto>> SearchAsync(string? search, bool? isActive, int page, int pageSize, CancellationToken ct = default, CatalogFilters? filters = null);
    Task<ProductDto> GetAsync(int id, CancellationToken ct = default);
    Task<IReadOnlyList<ProductDto>> GetLowStockAsync(CancellationToken ct = default);
    Task<IReadOnlyList<BrandDto>> BrandsAsync(string? search, bool? isActive, CatalogFilters filters, CancellationToken ct = default);
    Task<BrandLinesDto> LinesAsync(string brandSlug, string? search, bool? isActive, CatalogFilters filters, CancellationToken ct = default);
}

public sealed class CatalogService : ICatalogService
{
    private readonly IAppDbContext _db;
    private readonly ISettingsService _settings;
    private readonly ICurrentUser? _currentUser;

    public CatalogService(IAppDbContext db, ISettingsService settings, ICurrentUser? currentUser = null)
    {
        _db = db;
        _settings = settings;
        _currentUser = currentUser;
    }

    public async Task<PagedResult<ProductDto>> SearchAsync(string? search, bool? isActive, int page, int pageSize, CancellationToken ct = default, CatalogFilters? filters = null)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        filters ??= new CatalogFilters();
        var filtered = await FilteredAsync(isActive, filters, includeBrandAndLine: true, ct);
        var (query, rank) = await WithSearchAsync(filtered, search, ct);

        var total = await query.CountAsync(ct);
        var window = Order(query, filters.Sort, rank).Skip((page - 1) * pageSize).Take(pageSize);

        if (rank is null)
            return new PagedResult<ProductDto>(await window.Select(Projection).ToListAsync(ct), page, pageSize, total);

        // Relevance first means the ordering is a CASE over the trigram columns, so the page is read as ids
        // and only those rows carry the full projection.
        var ids = await window.Select(p => p.Id).ToListAsync(ct);
        var rows = await _db.Products.AsNoTracking().Where(p => ids.Contains(p.Id)).Select(Projection).ToListAsync(ct);
        var byId = rows.ToDictionary(r => r.Id);
        // A product deleted between the two reads simply drops out of the page.
        var items = ids.Select(id => byId.GetValueOrDefault(id)).Where(r => r is not null).Select(r => r!).ToList();

        return new PagedResult<ProductDto>(items, page, pageSize, total);
    }

    /// <summary>
    /// Brand facet counts: every filter except the brand/line selection, so a count always equals the
    /// result count the shopper gets after clicking that brand.
    /// </summary>
    public async Task<IReadOnlyList<BrandDto>> BrandsAsync(string? search, bool? isActive, CatalogFilters filters, CancellationToken ct = default)
    {
        var filtered = await FilteredAsync(isActive, filters with { Brands = null, Lines = null }, includeBrandAndLine: false, ct);
        var query = (await WithSearchAsync(filtered, search, ct)).Query;

        // Grouping on the foreign key alone translates to SQL; the names come from one small follow-up read.
        var counts = await query.Where(p => p.BrandId != null)
            .GroupBy(p => p.BrandId)
            .Select(g => new { BrandId = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var ids = counts.Where(c => c.BrandId != null).Select(c => c.BrandId!.Value).ToList();
        var named = await _db.Brands.AsNoTracking().Where(b => ids.Contains(b.Id) && b.IsActive)
            .Select(b => new { b.Id, b.Name, b.Slug }).ToListAsync(ct);

        return named
            .Select(b => new BrandDto(b.Id, b.Name, b.Slug, counts.First(c => c.BrandId == b.Id).Count))
            .OrderBy(b => b.Name).ThenBy(b => b.Id)
            .ToList();
    }

    /// <summary>Series of one brand, counted with the same rule as the brand facet. A line implies its brand.</summary>
    public async Task<BrandLinesDto> LinesAsync(string brandSlug, string? search, bool? isActive, CatalogFilters filters, CancellationToken ct = default)
    {
        var brand = await _db.Brands.AsNoTracking()
            .FirstOrDefaultAsync(b => b.Slug == brandSlug.Trim().ToLowerInvariant() && b.IsActive, ct)
            ?? throw new NotFoundException("This brand is unavailable.");

        var filtered = await FilteredAsync(isActive, filters with { Brands = null, Lines = null }, includeBrandAndLine: false, ct);
        var query = (await WithSearchAsync(filtered, search, ct)).Query.Where(p => p.BrandId == brand.Id);

        var brandCount = await query.CountAsync(ct);
        var counts = await query.Where(p => p.ProductLineId != null)
            .GroupBy(p => p.ProductLineId)
            .Select(g => new { LineId = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var ids = counts.Where(c => c.LineId != null).Select(c => c.LineId!.Value).ToList();
        var named = await _db.ProductLines.AsNoTracking().Where(l => ids.Contains(l.Id) && l.IsActive)
            .Select(l => new { l.Id, l.Name, l.Slug, l.SortOrder }).ToListAsync(ct);

        // Only series that actually have products in the current result set appear in the picker.
        var lines = named
            .Select(l => new ProductLineDto(l.Id, l.Name, l.Slug, l.SortOrder, counts.First(c => c.LineId == l.Id).Count))
            .Where(l => l.ProductCount > 0)
            .OrderBy(l => l.SortOrder).ThenBy(l => l.Name)
            .ToList();

        return new BrandLinesDto(brand.Id, brand.Name, brand.Slug, brandCount, lines);
    }

    private async Task<(IQueryable<Product> Query, List<string>? Rank)> WithSearchAsync(
        IQueryable<Product> query, string? search, CancellationToken ct)
        => string.IsNullOrWhiteSpace(search) ? (query, null) : await SearchedAsync(query, search, ct);

    /// <summary>
    /// One trigram predicate per word; words are AND-ed, exactly as they always were. Naming a brand or a
    /// category resolves to ids before the product query runs, so every branch of the OR stays a column of
    /// the Products table and the planner can combine index scans instead of reading the whole table.
    /// </summary>
    private async Task<(IQueryable<Product> Query, List<string> Rank)> SearchedAsync(
        IQueryable<Product> query, string search, CancellationToken ct)
    {
        foreach (var alternatives in CatalogSearch.Terms(search))
        {
            var patterns = CatalogSearch.Patterns(alternatives);
            if (patterns.Count == 0) continue;

            var brandIds = await _db.Brands.AsNoTracking()
                .Where(b => patterns.Any(t => EF.Functions.ILike(b.Name, t))).Select(b => b.Id).ToListAsync(ct);
            var categoryIds = await _db.Categories.AsNoTracking()
                .Where(c => patterns.Any(t => EF.Functions.ILike(c.Name, t))).Select(c => c.Id).ToListAsync(ct);
            var inCategory = categoryIds.Count == 0
                ? new List<int>()
                : await _db.ProductCategories.AsNoTracking().Where(pc => categoryIds.Contains(pc.CategoryId))
                    .Select(pc => pc.ProductId).Distinct().ToListAsync(ct);

            query = query.Where(p => patterns.Any(t => EF.Functions.ILike(p.Name, t))
                || patterns.Any(t => EF.Functions.ILike(p.Sku, t))
                || (p.Description != null && patterns.Any(t => EF.Functions.ILike(p.Description, t)))
                || (p.BrandId != null && brandIds.Contains(p.BrandId.Value))
                || inCategory.Contains(p.Id));
        }

        return (query, CatalogSearch.Patterns(search));
    }

    private async Task<IQueryable<Product>> FilteredAsync(
        bool? isActive, CatalogFilters filters, bool includeBrandAndLine, CancellationToken ct)
    {
        // AsNoTracking: reads never need the change tracker, and the API is read-heavy.
        var query = _db.Products.AsNoTracking();

        if (_currentUser is not null && !_currentUser.IsInRole(UserRole.Staff, UserRole.InventoryManager, UserRole.Administrator))
            query = query.Where(p => p.IsActive && p.ParentProductId == null);
        else if (isActive is not null) query = query.Where(p => p.IsActive == isActive);

        if (filters.MinPrice < 0 || filters.MaxPrice < 0 || (filters.MinPrice != null && filters.MaxPrice != null && filters.MinPrice > filters.MaxPrice))
            throw new BusinessValidationException("Use a nonnegative price range with minimum no greater than maximum.");
        if (!new[] { "name", "price", "stock", "newest" }.Contains(filters.Sort)) throw new BusinessValidationException("Unknown catalogue sort.");
        if (filters.CategoryId != null || !string.IsNullOrWhiteSpace(filters.CategorySlug))
        {
            var all = await _db.Categories.AsNoTracking().ToListAsync(ct);
            var c = CategoryService.Visible(all, false).FirstOrDefault(c =>
                (filters.CategoryId == null || c.Id == filters.CategoryId) &&
                (string.IsNullOrWhiteSpace(filters.CategorySlug) || c.Slug.Equals(filters.CategorySlug, StringComparison.OrdinalIgnoreCase)))
                ?? throw new NotFoundException("This category is unavailable.");
            var ids = CategoryService.Visible(all, false).Where(x => x.Id == c.Id || (filters.IncludeDescendants && x.Path.StartsWith(c.Path, StringComparison.Ordinal))).Select(x => x.Id).ToList();
            query = query.Where(p => p.Categories.Any(pc => ids.Contains(pc.CategoryId)));
        }
        // One tag, or a comma separated list. Inside the tag facet the values are OR-ed, exactly
        // like the brand facet, so "?tag=a,b" widens the result set rather than emptying it.
        var tagNames = (filters.Tag ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (tagNames.Count > 0) query = query.Where(p => p.Tags.Any(t => tagNames.Contains(t.Tag.Name)));
        if (filters.InStock == true) query = query.Where(p => p.IsActive && (p.StockQuantity > 0 || p.Variants.Any(v => v.IsActive && v.StockQuantity > 0)));
        if (filters.InStock == false) query = query.Where(p => !p.IsActive || (p.StockQuantity <= 0 && !p.Variants.Any(v => v.IsActive && v.StockQuantity > 0)));
        if (filters.MinPrice != null) query = query.Where(p => p.Price >= filters.MinPrice);
        if (filters.MaxPrice != null) query = query.Where(p => p.Price <= filters.MaxPrice);

        if (!includeBrandAndLine) return query;

        var brandSlugs = (filters.Brands ?? []).Select(Slug).Where(x => x.Length > 0).Distinct().ToList();
        var lineSlugs = (filters.Lines ?? []).Select(Slug).Where(x => x.Length > 0).Distinct().ToList();

        var brandIds = brandSlugs.Count == 0
            ? new List<int>()
            : await _db.Brands.AsNoTracking().Where(b => brandSlugs.Contains(b.Slug) && b.IsActive).Select(b => b.Id).ToListAsync(ct);
        if (brandIds.Count != brandSlugs.Count) throw new NotFoundException("This brand is unavailable.");

        var lineIds = lineSlugs.Count == 0
            ? new List<(int Id, int BrandId)>()
            : (await _db.ProductLines.AsNoTracking().Where(l => lineSlugs.Contains(l.Slug) && l.IsActive)
                .Select(l => new { l.Id, l.BrandId }).ToListAsync(ct)).Select(x => (x.Id, x.BrandId)).ToList();
        if (lineIds.Count != lineSlugs.Count) throw new NotFoundException("This series is unavailable.");

        // A series always belongs to one brand, so a brand + series pair from different brands can never
        // match. That is a bad request, not an empty result.
        if (brandIds.Count > 0 && lineIds.Any(l => !brandIds.Contains(l.BrandId)))
            throw new BusinessValidationException("A series can only be combined with the brand it belongs to.");

        var lineIdValues = lineIds.Select(l => l.Id).ToList();
        if (brandIds.Count > 0) query = query.Where(p => p.BrandId != null && brandIds.Contains(p.BrandId.Value));
        if (lineIdValues.Count > 0) query = query.Where(p => p.ProductLineId != null && lineIdValues.Contains(p.ProductLineId.Value));

        return query;
    }

    /// <summary>
    /// With search text, a product whose name matches comes before one that only matches on SKU, and either
    /// comes before a description, brand or category match. The shopper's sort then orders inside a tier.
    /// </summary>
    private static IOrderedQueryable<Product> Order(IQueryable<Product> query, string sort, List<string>? rank)
    {
        if (rank is null) return sort switch
        {
            "price" => query.OrderBy(p => p.Price).ThenBy(p => p.Id),
            "stock" => query.OrderByDescending(p => p.StockQuantity).ThenBy(p => p.Id),
            "newest" => query.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id),
            _ => query.OrderBy(p => p.Name).ThenBy(p => p.Id)
        };

        var byRelevance = query.OrderBy(p =>
            rank.Any(t => EF.Functions.ILike(p.Name, t)) ? 0
            : rank.Any(t => EF.Functions.ILike(p.Sku, t)) ? 1
            : p.Description != null && rank.Any(t => EF.Functions.ILike(p.Description, t)) ? 2
            : 3);

        var bySort = sort switch
        {
            "price" => byRelevance.ThenBy(p => p.Price),
            "stock" => byRelevance.ThenByDescending(p => p.StockQuantity),
            "newest" => byRelevance.ThenByDescending(p => p.CreatedAt),
            _ => byRelevance.ThenBy(p => p.Name)
        };

        return sort == "newest" ? bySort.ThenByDescending(p => p.Id) : bySort.ThenBy(p => p.Id);
    }

    private static string Slug(string? value) => value?.Trim().ToLowerInvariant() ?? string.Empty;

    public async Task<ProductDto> GetAsync(int id, CancellationToken ct = default)
    {
        var product = await _db.Products.AsNoTracking()
            .Where(p => p.Id == id && (p.IsActive || _currentUser == null || _currentUser.IsInRole(UserRole.Staff, UserRole.InventoryManager, UserRole.Administrator)))
            .Select(Projection)
            .FirstOrDefaultAsync(ct);

        return product ?? throw new NotFoundException($"Product {id} was not found.");
    }

    public async Task<IReadOnlyList<ProductDto>> GetLowStockAsync(CancellationToken ct = default)
    {
        var threshold = await _settings.GetLowStockThresholdAsync(ct);

        return await _db.Products.AsNoTracking()
            .Where(p => p.IsActive && p.StockQuantity <= threshold)
            .OrderBy(p => p.StockQuantity).ThenBy(p => p.Name)
            .Select(Projection)
            .ToListAsync(ct);
    }

    public static readonly System.Linq.Expressions.Expression<Func<Product, ProductDto>> Projection =
        p => new ProductDto(
            p.Id,
            p.Sku,
            p.Name,
            p.Price,
            p.Variants.Any(v => v.IsActive) ? p.Variants.Where(v => v.IsActive).Sum(v => v.StockQuantity) : p.StockQuantity,
            p.IsActive,
            p.RowVersion == null ? null : Convert.ToBase64String(p.RowVersion), p.Description, p.ImageUrl,
            p.Categories.OrderByDescending(c => c.IsPrimary).ThenBy(c => c.Category.Name).Select(c => new ProductCategoryDto(c.CategoryId, c.Category.Name, c.Category.Slug, c.IsPrimary)).ToList(),
            p.Tags.OrderBy(t => t.Tag.Name).Select(t => t.Tag.Name).ToList(),
            p.Currency, p.Slug, p.NeedsReview, p.SourceName, p.SourceUrl, p.PriceBasis, p.PriceVerifiedAt,
            p.BrandId, p.Brand == null ? null : p.Brand.Name, p.Brand == null ? null : p.Brand.Slug,
            p.ProductLineId, p.ProductLine == null ? null : p.ProductLine.Name, p.ProductLine == null ? null : p.ProductLine.Slug,
            p.Images.OrderBy(i => i.SortOrder).ThenBy(i => i.Id).Select(i => new ProductImageDto(i.Id, i.Url, i.IsPrimary, i.AltText)).ToList(),
            p.CompareAtPrice, p.ParentProductId, p.VariantLabel, p.Variants.Any(v => v.IsActive), p.SpecsJson);
}
