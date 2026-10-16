using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IBulkProductService
{
    Task<BulkProductResultDto> ApplyAsync(BulkProductRequest request, CancellationToken ct = default);
}

/// <summary>
/// Batch edits for the staff product list.
///
/// Deliberately narrow: category, tags, active flag and brand/series only. Stock never appears
/// here because its invariant lives in the atomic conditional UPDATE of
/// <see cref="InventoryService.AdjustStockAsync" />, which cannot be expressed as a batch.
///
/// One transaction per request. A per-item problem (unknown id, tag limit) becomes a "failed"
/// row in the result; a database error still aborts the whole batch.
/// </summary>
public sealed class BulkProductService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IClock clock,
    IBrandService brands) : IBulkProductService
{
    public const int MaxIds = 200;
    private const int MaxTagsPerProduct = 20;
    private const int MaxTagNameLength = 80;

    private sealed record Row(int Id, string Sku, string Name, bool IsActive, int? BrandId, int? ProductLineId, int? PrimaryCategoryId);

    public async Task<BulkProductResultDto> ApplyAsync(BulkProductRequest request, CancellationToken ct = default)
    {
        var ids = Validate(request);
        var action = request.Action.Trim().ToLowerInvariant();
        var parameters = request.Params ?? new BulkProductParams();
        var categoryId = RequireCategory(action, parameters);
        var tagNames = RequireTags(action, parameters);

        int? brandId = parameters.BrandId;
        int? productLineId = parameters.ProductLineId;
        if (action == BulkProductActions.AssignBrand)
        {
            if (brandId is null && productLineId is null)
            {
                throw new BusinessValidationException(
                    "assign-brand needs a brandId or a productLineId.",
                    new Dictionary<string, string[]> { ["params.brandId"] = new[] { "Choose a brand or a series." } });
            }

            // A series always carries its brand, so a mismatched pair fails the whole request.
            (brandId, productLineId) = await brands.ResolveAsync(brandId, productLineId, ct);
        }

        var rows = (await db.Products.AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .Select(p => new Row(
                p.Id, p.Sku, p.Name, p.IsActive, p.BrandId, p.ProductLineId,
                p.Categories.Where(c => c.IsPrimary).Select(c => c.CategoryId).FirstOrDefault()))
            .ToListAsync(ct)).ToDictionary(r => r.Id);

        var results = new List<BulkItemResult>();
        var candidates = new List<Row>();

        foreach (var id in ids)
        {
            if (rows.TryGetValue(id, out var row)) candidates.Add(row);
            else results.Add(new BulkItemResult(id, null, null, "failed", "Product not found."));
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var changed = candidates.Count == 0
            ? new HashSet<int>()
            : action switch
            {
                BulkProductActions.SetCategory => await SetCategoryAsync(candidates, categoryId!.Value, ct),
                BulkProductActions.AddTags => await AddTagsAsync(candidates, tagNames, results, ct),
                BulkProductActions.RemoveTags => await RemoveTagsAsync(candidates, tagNames, ct),
                BulkProductActions.Activate => await SetActiveAsync(candidates, true, ct),
                BulkProductActions.Deactivate => await SetActiveAsync(candidates, false, ct),
                BulkProductActions.AssignBrand => await AssignBrandAsync(candidates, brandId, productLineId, ct),
                _ => new HashSet<int>()
            };

        foreach (var row in candidates.Where(r => !results.Any(x => x.Id == r.Id)))
        {
            results.Add(new BulkItemResult(row.Id, row.Sku, row.Name,
                changed.Contains(row.Id) ? "updated" : "skipped",
                changed.Contains(row.Id) ? null : AlreadyCurrent(action, row, categoryId, brandId, productLineId)));
        }

        if (changed.Count > 0)
        {
            db.AuditLogs.Add(new AuditLog
            {
                UserId = currentUser.UserId,
                Action = AuditActions.ProductBulkUpdated,
                EntityType = nameof(Product),
                EntityId = null,
                CreatedAt = clock.UtcNow,
                Details = $"action={action}; updated={changed.Count}; requested={ids.Count}"
            });
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        results = results.OrderBy(r => r.Id).ToList();

        return new BulkProductResultDto(
            action,
            ids.Count,
            results.Count(r => r.Result == "updated"),
            results.Count(r => r.Result == "skipped"),
            results.Count(r => r.Result == "failed"),
            results);
    }

    // ------------------------------------------------------------------ per action

    /// <summary>
    /// Drops any other primary first, then marks the target row. Two primaries for one product would
    /// break the filtered unique index, so the order of these two statements is the whole point.
    /// </summary>
    private async Task<HashSet<int>> SetCategoryAsync(List<Row> rows, int categoryId, CancellationToken ct)
    {
        var productIds = rows.Select(r => r.Id).ToList();

        await db.ProductCategories
            .Where(pc => productIds.Contains(pc.ProductId) && pc.IsPrimary && pc.CategoryId != categoryId)
            .ExecuteUpdateAsync(s => s.SetProperty(pc => pc.IsPrimary, false), ct);

        var links = await db.ProductCategories
            .Where(pc => productIds.Contains(pc.ProductId) && pc.CategoryId == categoryId)
            .ToListAsync(ct);

        var changed = links.Where(pc => !pc.IsPrimary).Select(pc => pc.ProductId).ToHashSet();
        foreach (var link in links.Where(link => !link.IsPrimary)) link.IsPrimary = true;

        foreach (var productId in productIds.Except(links.Select(pc => pc.ProductId)))
        {
            db.ProductCategories.Add(new ProductCategory { ProductId = productId, CategoryId = categoryId, IsPrimary = true });
            changed.Add(productId);
        }

        // Touching UpdatedAt keeps the product rows honest about having been edited.
        await MarkTouchedAsync(changed, ct);
        return changed;
    }

    private async Task<HashSet<int>> AddTagsAsync(
        List<Row> rows,
        IReadOnlyList<string> tagNames,
        List<BulkItemResult> results,
        CancellationToken ct)
    {
        var tags = await GetOrCreateTagsAsync(tagNames, ct);
        var tagIds = tags.Select(t => t.Id).ToHashSet();
        var productIds = rows.Select(r => r.Id).ToList();

        var current = await db.ProductTags.AsNoTracking()
            .Where(pt => productIds.Contains(pt.ProductId))
            .Select(pt => new { pt.ProductId, pt.TagId })
            .ToListAsync(ct);

        var byProduct = current.GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => g.Select(x => x.TagId).ToHashSet());
        var changed = new HashSet<int>();

        foreach (var row in rows)
        {
            var have = byProduct.TryGetValue(row.Id, out var set) ? set : new HashSet<int>();
            var missing = tagIds.Except(have).ToList();
            if (missing.Count == 0) continue;

            // The 20 tag limit is per product, so one full product must not fail the batch.
            if (have.Count + missing.Count > MaxTagsPerProduct)
            {
                results.Add(new BulkItemResult(row.Id, row.Sku, row.Name, "failed",
                    $"This product carries {have.Count} tags and can take at most {MaxTagsPerProduct}."));
                continue;
            }

            foreach (var tagId in missing)
            {
                db.ProductTags.Add(new ProductTag { ProductId = row.Id, TagId = tagId });
            }
            changed.Add(row.Id);
        }

        await MarkTouchedAsync(changed, ct);
        return changed;
    }

    private async Task<HashSet<int>> RemoveTagsAsync(List<Row> rows, IReadOnlyList<string> tagNames, CancellationToken ct)
    {
        var tagIds = await db.Tags.AsNoTracking()
            .Where(t => tagNames.Contains(t.Name))
            .Select(t => t.Id)
            .ToListAsync(ct);

        if (tagIds.Count == 0) return new HashSet<int>();

        var productIds = rows.Select(r => r.Id).ToList();
        var links = await db.ProductTags
            .Where(pt => productIds.Contains(pt.ProductId) && tagIds.Contains(pt.TagId))
            .ToListAsync(ct);

        db.ProductTags.RemoveRange(links);

        var changed = links.Select(pt => pt.ProductId).ToHashSet();
        await MarkTouchedAsync(changed, ct);
        return changed;
    }

    private async Task<HashSet<int>> SetActiveAsync(List<Row> rows, bool isActive, CancellationToken ct)
    {
        var productIds = rows.Select(r => r.Id).ToList();
        var products = await db.Products
            .Where(p => productIds.Contains(p.Id) && p.IsActive != isActive)
            .ToListAsync(ct);

        foreach (var product in products)
        {
            product.IsActive = isActive;
            product.UpdatedAt = clock.UtcNow;
        }

        return products.Select(p => p.Id).ToHashSet();
    }

    private async Task<HashSet<int>> AssignBrandAsync(List<Row> rows, int? brandId, int? productLineId, CancellationToken ct)
    {
        var productIds = rows.Select(r => r.Id).ToList();
        var products = await db.Products
            .Where(p => productIds.Contains(p.Id))
            .ToListAsync(ct);

        var changed = new HashSet<int>();

        foreach (var product in products)
        {
            if (product.BrandId == brandId && product.ProductLineId == productLineId) continue;

            product.BrandId = brandId;
            product.ProductLineId = productLineId;
            product.UpdatedAt = clock.UtcNow;
            changed.Add(product.Id);
        }

        return changed;
    }

    private async Task MarkTouchedAsync(HashSet<int> productIds, CancellationToken ct)
    {
        if (productIds.Count == 0) return;

        await db.Products
            .Where(p => productIds.Contains(p.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.UpdatedAt, clock.UtcNow), ct);
    }

    private async Task<List<Tag>> GetOrCreateTagsAsync(IReadOnlyList<string> tagNames, CancellationToken ct)
    {
        var found = await db.Tags.Where(t => tagNames.Contains(t.Name)).ToListAsync(ct);
        var known = found.Select(t => t.Name).ToHashSet(StringComparer.Ordinal);

        foreach (var name in tagNames.Where(n => !known.Contains(n)))
        {
            var tag = new Tag { Name = name };
            db.Tags.Add(tag);
            found.Add(tag);
        }

        // The links need real tag ids, so brand new tags are flushed before they are referenced.
        if (found.Any(t => t.Id == 0)) await db.SaveChangesAsync(ct);

        return found;
    }

    // ------------------------------------------------------------------ validation

    private static List<int> Validate(BulkProductRequest request)
    {
        if (request.Ids is null || request.Ids.Count == 0)
        {
            throw new BusinessValidationException(
                "Select at least one product.",
                new Dictionary<string, string[]> { ["ids"] = new[] { "Select at least one product." } });
        }

        if (request.Ids.Count > MaxIds)
        {
            throw new BusinessValidationException(
                $"A bulk update accepts at most {MaxIds} products per request.",
                new Dictionary<string, string[]> { ["ids"] = new[] { $"Received {request.Ids.Count} ids; the limit is {MaxIds}." } });
        }

        if (request.Ids.Any(id => id <= 0))
        {
            throw new BusinessValidationException(
                "Every selected product needs a valid id.",
                new Dictionary<string, string[]> { ["ids"] = new[] { "Ids must be positive." } });
        }

        if (string.IsNullOrWhiteSpace(request.Action))
        {
            throw new BusinessValidationException(
                "Choose a bulk action.",
                new Dictionary<string, string[]> { ["action"] = new[] { "action is required." } });
        }

        var action = request.Action.Trim().ToLowerInvariant();
        if (!BulkProductActions.All.Contains(action))
        {
            throw new BusinessValidationException(
                $"Unknown bulk action \"{request.Action}\".",
                new Dictionary<string, string[]> { ["action"] = new[] { $"Allowed actions: {string.Join(", ", BulkProductActions.All)}." } });
        }

        return request.Ids.Distinct().OrderBy(id => id).ToList();
    }

    private int? RequireCategory(string action, BulkProductParams parameters)
    {
        if (action != BulkProductActions.SetCategory) return null;

        if (parameters.CategoryId is null)
        {
            throw new BusinessValidationException(
                "set-category needs a categoryId.",
                new Dictionary<string, string[]> { ["params.categoryId"] = new[] { "A category is required." } });
        }

        if (!db.Categories.Any(c => c.Id == parameters.CategoryId)) throw new NotFoundException("This category is unavailable.");

        return parameters.CategoryId;
    }

    private static IReadOnlyList<string> RequireTags(string action, BulkProductParams parameters)
    {
        if (action is not (BulkProductActions.AddTags or BulkProductActions.RemoveTags)) return [];

        var supplied = (parameters.Tags ?? [])
            .Select(t => t?.Trim() ?? string.Empty)
            .Where(t => t.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (supplied.Count == 0)
        {
            throw new BusinessValidationException(
                $"{action} needs at least one tag.",
                new Dictionary<string, string[]> { ["params.tags"] = new[] { "Provide the tags to add or remove." } });
        }

        if (supplied.Any(t => t.Length > MaxTagNameLength))
            throw new BusinessValidationException($"Tag names are limited to {MaxTagNameLength} characters.");

        return supplied;
    }

    /// <summary>Why an existing row was reported as skipped rather than changed.</summary>
    private static string? AlreadyCurrent(string action, Row row, int? categoryId, int? brandId, int? productLineId) => action switch
    {
        BulkProductActions.SetCategory when row.PrimaryCategoryId == categoryId => "Already in this category.",
        BulkProductActions.AddTags => "Already tagged.",
        BulkProductActions.RemoveTags => "None of these tags are set.",
        BulkProductActions.Activate when row.IsActive => "Already active.",
        BulkProductActions.Deactivate when !row.IsActive => "Already inactive.",
        BulkProductActions.AssignBrand when row.BrandId == brandId && row.ProductLineId == productLineId => "Already assigned.",
        _ => null
    };
}
