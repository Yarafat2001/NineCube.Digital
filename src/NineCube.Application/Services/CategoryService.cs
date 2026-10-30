using System.Data;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public sealed class CategoryService(IAppDbContext db, ISettingsService settings, ICacheService cache)
{
    public async Task<IReadOnlyList<CategoryDto>> TreeAsync(bool includeInactive, CancellationToken ct)
    {
        return await cache.GetOrCreateAsync(
            $"categories:tree:{includeInactive}",
            async token =>
            {
                var categories = await db.Categories.AsNoTracking().ToListAsync(token);
                var visible = Visible(categories, includeInactive);
                var links = await db.ProductCategories.AsNoTracking().Select(x => new { x.CategoryId, x.ProductId, x.Product.StockQuantity, x.Product.IsActive }).ToListAsync(token);
                var threshold = await settings.GetLowStockThresholdAsync(token);
                CategoryDto Build(Category c)
                {
                    var branch = visible.Where(x => x.Path.StartsWith(c.Path, StringComparison.Ordinal)).Select(x => x.Id).ToHashSet();
                    var products = links.Where(x => branch.Contains(x.CategoryId)).DistinctBy(x => x.ProductId).ToList();
                    var direct = links.Where(x => x.CategoryId == c.Id).ToList();
                    return new(c.Id, c.Name, c.Slug, c.ParentId, c.Path, c.Depth, c.SortOrder, c.IsActive,
                        products.Count, products.Count(x => x.IsActive && x.StockQuantity > 0),
                        products.Count(x => x.IsActive && x.StockQuantity <= threshold),
                        direct.Count, direct.Count(x => x.IsActive && x.StockQuantity > 0),
                        Breadcrumb(c, categories),
                        visible.Where(x => x.ParentId == c.Id).OrderBy(x => x.SortOrder).ThenBy(x => x.Name).Select(Build).ToList());
                }
                return visible.Where(x => x.ParentId == null).OrderBy(x => x.SortOrder).ThenBy(x => x.Name).Select(Build).ToList();
            },
            TimeSpan.FromMinutes(10),
            ct);
    }

    public async Task<CategoryDto> GetAsync(int id, bool includeInactive, CancellationToken ct)
    {
        var tree = await TreeAsync(includeInactive, ct);
        CategoryDto? Find(IEnumerable<CategoryDto> nodes) => nodes.Select(c => c.Id == id ? c : Find(c.Children)).FirstOrDefault(c => c != null);
        return Find(tree) ?? throw new NotFoundException("This category is unavailable.");
    }

    public static List<Category> Visible(List<Category> categories, bool includeInactive)
    {
        if (includeInactive) return categories;
        var hidden = categories.Where(c => !c.IsActive).Select(c => c.Path).ToList();
        return categories.Where(c => !hidden.Any(path => c.Path.StartsWith(path, StringComparison.Ordinal))).ToList();
    }
    private static IReadOnlyList<CategoryCrumb> Breadcrumb(Category c, List<Category> all) => all
        .Where(x => c.Path.StartsWith(x.Path, StringComparison.Ordinal)).OrderBy(x => x.Depth)
        .Select(x => new CategoryCrumb(x.Id, x.Name, x.Slug)).ToList();

    private async Task<T> Mutate<T>(Func<Task<T>> action, CancellationToken ct) => await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        // Serialize hierarchy edits and category assignments; inventory rows are never updated.
        try
        {
            var lockResult = await db.Database.SqlQueryRaw<int>("DECLARE @result int; EXEC @result = sp_getapplock @Resource=N'NineCube.Categories', @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=15000; SELECT @result AS Value;").ToListAsync(ct);
            if (lockResult[0] < 0) throw new ResourceConflictException("Category edits are busy. Try again.", "category_busy");
            var result = await action();
            await tx.CommitAsync(ct);
            cache.RemoveByPrefix("categories:");
            return result;
        }
        catch
        {
            // A retry must reload state rolled back after an intermediate SaveChanges.
            // Disposing the uncommitted transaction rolls it back before a retry begins.
            db.ChangeTracker.Clear();
            throw;
        }
    });

    private static void ValidateTree(List<Category> all)
    {
        foreach (var c in all)
        {
            c.Name = c.Name.Trim(); c.Slug = c.Slug.Trim().ToLowerInvariant();
            if (c.Name.Length is < 1 or > 120 || c.Slug.Length is < 1 or > 120 || !Regex.IsMatch(c.Slug, "^[a-z0-9]+(?:-[a-z0-9]+)*$"))
                throw new BusinessValidationException("Use a category name and a lowercase slug containing letters, numbers, and hyphens.");
        }
        if (all.GroupBy(c => c.Slug, StringComparer.OrdinalIgnoreCase).Any(g => g.Count() > 1) ||
            all.GroupBy(c => (c.ParentId, c.Name.ToUpperInvariant())).Any(g => g.Count() > 1))
            throw new ResourceConflictException("Category slugs must be unique and names must be unique among siblings.", "category_duplicate");
        var visiting = new HashSet<Category>(); var finished = new HashSet<Category>();
        void Compute(Category c)
        {
            if (finished.Contains(c)) return;
            if (!visiting.Add(c)) throw new ResourceConflictException("A category cannot move under itself or a descendant.", "category_cycle");
            var parent = c.ParentId is int id ? all.FirstOrDefault(x => x.Id == id) ?? throw new NotFoundException("Parent category not found.") : null;
            if (parent != null) Compute(parent);
            c.Depth = (parent?.Depth ?? 0) + 1;
            if (c.Depth > 4) throw new ResourceConflictException("A category tree can have at most four levels.", "category_depth");
            c.Path = (parent?.Path ?? "/") + c.Slug + "/";
            visiting.Remove(c); finished.Add(c);
        }
        foreach (var c in all) Compute(c);
    }

    public async Task<CategoryDto> CreateAsync(CategoryRequest request, CancellationToken ct)
    {
        var id = await Mutate(async () => {
            var all = await db.Categories.ToListAsync(ct);
            var c = new Category { Name = request.Name ?? "", Slug = request.Slug ?? "", ParentId = request.ParentId, SortOrder = request.SortOrder, IsActive = request.IsActive };
            all.Add(c); ValidateTree(all); db.Categories.Add(c); await db.SaveChangesAsync(ct); return c.Id;
        }, ct);
        return await GetAsync(id, true, ct);
    }

    public async Task<CategoryDto> UpdateAsync(int id, CategoryRequest request, CancellationToken ct)
    {
        await Mutate(async () => {
            var all = await db.Categories.ToListAsync(ct);
            var c = all.FirstOrDefault(x => x.Id == id) ?? throw new NotFoundException("Category not found.");
            if (id == 1 && (request.Name != "Uncategorized" || request.Slug != "uncategorized" || request.ParentId != null || !request.IsActive))
                throw new ResourceConflictException("Uncategorized must stay active at the root with its original name and slug.", "category_protected");
            c.Name = request.Name ?? ""; c.Slug = request.Slug ?? ""; c.ParentId = request.ParentId; c.SortOrder = request.SortOrder; c.IsActive = request.IsActive;
            ValidateTree(all); await db.SaveChangesAsync(ct); return true;
        }, ct);
        return await GetAsync(id, true, ct);
    }

    public async Task<CategoryDto> MoveAsync(int id, MoveCategoryRequest request, CancellationToken ct)
    {
        await Mutate(async () => {
            var all = await db.Categories.ToListAsync(ct);
            var c = all.FirstOrDefault(x => x.Id == id) ?? throw new NotFoundException("Category not found.");
            if (id == 1 && request.ParentId != null) throw new ResourceConflictException("Uncategorized cannot be moved under another category.", "category_protected");
            c.ParentId = request.ParentId; c.SortOrder = request.SortOrder ?? c.SortOrder;
            ValidateTree(all); await db.SaveChangesAsync(ct); return true;
        }, ct);
        return await GetAsync(id, true, ct);
    }

    public Task<bool> DeleteAsync(int id, int? reassignTo, CancellationToken ct) => Mutate(async () =>
    {
        var all = await db.Categories.ToListAsync(ct);
        var c = all.FirstOrDefault(x => x.Id == id) ?? throw new NotFoundException("Category not found.");
        if (id == 1) throw new ResourceConflictException("Uncategorized cannot be deleted.", "category_protected");
        var links = await db.ProductCategories.Where(x => x.CategoryId == id).ToListAsync(ct);
        var children = all.Where(x => x.ParentId == id).ToList();
        if (reassignTo == null && (links.Count > 0 || children.Count > 0))
            throw new ResourceConflictException("Choose a reassignment category before deleting a category with products or children.", "category_in_use");
        if (reassignTo is int targetId)
        {
            var target = all.FirstOrDefault(x => x.Id == targetId) ?? throw new NotFoundException("Reassignment category not found.");
            if (target.Path.StartsWith(c.Path, StringComparison.Ordinal)) throw new ResourceConflictException("Reassignment cannot target this category or its descendants.", "category_cycle");
            foreach (var child in children) child.ParentId = targetId;
            all.Remove(c); ValidateTree(all);
            // Remove first, save, then add: avoids a transient second primary in the unique index.
            db.ProductCategories.RemoveRange(links); await db.SaveChangesAsync(ct);
            foreach (var link in links)
            {
                var existing = await db.ProductCategories.FirstOrDefaultAsync(x => x.ProductId == link.ProductId && x.CategoryId == targetId, ct);
                if (existing == null) db.ProductCategories.Add(new ProductCategory { ProductId = link.ProductId, CategoryId = targetId, IsPrimary = link.IsPrimary });
                else if (link.IsPrimary) existing.IsPrimary = true;
            }
        }
        db.Categories.Remove(c); await db.SaveChangesAsync(ct); return true;
    }, ct);

    public async Task<ProductDto> SetProductAsync(int productId, ProductCategoriesRequest request, CancellationToken ct)
    {
        await Mutate(async () => {
            if (!await db.Products.AnyAsync(p => p.Id == productId, ct)) throw new NotFoundException("Product not found.");
            var ids = (request.CategoryIds ?? []).Distinct().ToList();
            if (ids.Count == 0) ids.Add(1);
            if (await db.Categories.CountAsync(c => ids.Contains(c.Id), ct) != ids.Count) throw new NotFoundException("One or more categories were not found.");
            var primary = request.CategoryIds?.Count == 0 ? 1 : request.PrimaryCategoryId ?? ids[0];
            if (!ids.Contains(primary)) throw new BusinessValidationException("The primary category must be selected in the category list.");
            var tags = request.Tags?.Select(x => x.Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (tags?.Any(x => x.Length > 80) == true || tags?.Count > 20) throw new BusinessValidationException("Use at most 20 tags of up to 80 characters.");
            db.ProductCategories.RemoveRange(await db.ProductCategories.Where(x => x.ProductId == productId).ToListAsync(ct));
            if (tags != null) db.ProductTags.RemoveRange(await db.ProductTags.Where(x => x.ProductId == productId).ToListAsync(ct));
            await db.SaveChangesAsync(ct);
            foreach (var categoryId in ids) db.ProductCategories.Add(new ProductCategory { ProductId = productId, CategoryId = categoryId, IsPrimary = categoryId == primary });
            if (tags != null) foreach (var name in tags)
            {
                var tag = await db.Tags.FirstOrDefaultAsync(x => x.Name == name, ct);
                if (tag == null) { tag = new Tag { Name = name }; db.Tags.Add(tag); }
                db.ProductTags.Add(new ProductTag { ProductId = productId, Tag = tag });
            }
            await db.SaveChangesAsync(ct); return true;
        }, ct);
        return await db.Products.Where(p => p.Id == productId).Select(CatalogService.Projection).SingleAsync(ct);
    }
    /// <summary>
    /// Tags with the counts the sidebar renders. Counted from the links table in one grouped query:
    /// "In-stock only" then only has to pick the right column, never a second request.
    /// </summary>
    public async Task<IReadOnlyList<TagDto>> TagsAsync(CancellationToken ct)
    {
        return await cache.GetOrCreateAsync(
            "categories:tags",
            async token =>
            {
                var counts = await db.ProductTags.AsNoTracking()
                    .GroupBy(pt => pt.TagId)
                    .Select(g => new
                    {
                        TagId = g.Key,
                        ProductCount = g.Count(),
                        InStockCount = g.Count(x => x.Product!.IsActive && x.Product.StockQuantity > 0)
                    })
                    .ToListAsync(token);

                var byTag = counts.ToDictionary(c => c.TagId);

                var tags = await db.Tags.AsNoTracking().OrderBy(t => t.Name).ToListAsync(token);

                return tags
                    .Select(t =>
                    {
                        byTag.TryGetValue(t.Id, out var row);
                        return new TagDto(t.Id, t.Name, row?.ProductCount ?? 0, row?.InStockCount ?? 0);
                    })
                    .ToList();
            },
            TimeSpan.FromMinutes(10),
            ct);
    }
}
