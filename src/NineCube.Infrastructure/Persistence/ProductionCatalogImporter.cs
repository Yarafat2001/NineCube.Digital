using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NineCube.Domain;

namespace NineCube.Infrastructure.Persistence;

/// <summary>Offline, additive catalogue import. Never resets stock, prices, orders or merchant edits.</summary>
public static class ProductionCatalogImporter
{
    public static async Task ImportAsync(AppDbContext db, ILogger logger, CancellationToken ct = default)
    {
        using var stream = typeof(ProductionCatalogImporter).Assembly.GetManifestResourceStream(
            "NineCube.Infrastructure.Persistence.production-catalogue.json")
            ?? throw new InvalidOperationException("Bundled production catalogue is missing.");
        var feed = await JsonSerializer.DeserializeAsync<Feed>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web), ct)
            ?? throw new InvalidOperationException("Bundled production catalogue is invalid.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Serialize rolling-deployment importers against the same PostgreSQL database.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(846239105)", ct);
        var categories = (await db.Categories.ToListAsync(ct)).ToDictionary(c => c.Slug);
        var createdCategories = 0;
        foreach (var item in feed.Categories.OrderBy(c => c.Depth))
        {
            if (categories.ContainsKey(item.Slug)) continue;
            var parent = item.ParentSlug is null ? null : categories[item.ParentSlug];
            var category = new Category { Name = item.Name, Slug = item.Slug, ParentId = parent?.Id,
                Path = $"{parent?.Path ?? "/"}{item.Slug}/", Depth = (parent?.Depth ?? 0) + 1,
                SortOrder = categories.Count, IsActive = true };
            if (category.Depth > 4) throw new InvalidOperationException("Catalogue category exceeds maximum depth.");
            db.Categories.Add(category);
            await db.SaveChangesAsync(ct);
            categories.Add(category.Slug, category); createdCategories++;
        }
        var existing = await db.Products.Include(p => p.Categories).Include(p => p.Images).Include(p => p.Tags).ToListAsync(ct);
        var bySku = existing.ToDictionary(p => p.Sku, StringComparer.OrdinalIgnoreCase);
        var bySlug = existing.Where(p => !string.IsNullOrWhiteSpace(p.Slug)).ToDictionary(p => p.Slug);
        var tags = (await db.Tags.ToListAsync(ct)).GroupBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var createdProducts = 0;
        foreach (var item in feed.Products)
        {
            bySku.TryGetValue(item.Sku, out var product);
            bySlug.TryGetValue(item.Slug, out var slugMatch);
            if (product is not null && slugMatch is not null && product.Id != slugMatch.Id)
                throw new InvalidOperationException($"Catalogue identity conflict for {item.Sku}.");
            product ??= slugMatch;
            var isNew = product is null;
            var now = DateTime.UtcNow;
            if (product is null)
            {
                product = new Product { Sku = item.Sku, Slug = item.Slug, Name = item.Name,
                    Price = item.Price, Currency = item.Currency, StockQuantity = 0, IsActive = true,
                    CreatedAt = now, UpdatedAt = now, NeedsReview = item.NeedsReview };
                db.Products.Add(product); createdProducts++;
                bySku.Add(product.Sku, product); bySlug.Add(product.Slug, product);
            }
            if (string.IsNullOrWhiteSpace(product.Description)) product.Description = item.Description;
            if (string.IsNullOrWhiteSpace(product.SpecsJson)) product.SpecsJson = item.SpecsJson;
            if (string.IsNullOrWhiteSpace(product.SourceName)) product.SourceName = item.SourceName;
            if (string.IsNullOrWhiteSpace(product.SourceUrl)) product.SourceUrl = item.SourceUrl;
            if (string.IsNullOrWhiteSpace(product.SourceLicense)) product.SourceLicense = item.SourceLicense;
            if (string.IsNullOrWhiteSpace(product.PriceBasis)) product.PriceBasis = item.PriceBasis;
            if (product.Categories.Count == 0)
                product.Categories.Add(new ProductCategory { CategoryId = categories[item.Category].Id, IsPrimary = true });
            if (product.Images.Count == 0)
            {
                // A merchant's existing image takes precedence over bundled media.
                var photos = string.IsNullOrWhiteSpace(product.ImageUrl) || item.Images.Any(i => i.Url == product.ImageUrl)
                    ? item.Images : [new Photo(product.ImageUrl, product.Name)];
                foreach (var photo in photos.Select((image, index) => (image, index)))
                    product.Images.Add(new ProductImage { Url = photo.image.Url, AltText = photo.image.AltText,
                        IsPrimary = photo.index == 0, SortOrder = photo.index, CreatedAt = now });
                if (string.IsNullOrWhiteSpace(product.ImageUrl)) product.ImageUrl = photos.FirstOrDefault()?.Url;
            }
            if (isNew || product.Tags.Count == 0)
                foreach (var name in item.Tags.Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    if (!tags.TryGetValue(name, out var tag))
                    {
                        tag = new Tag { Name = name }; db.Tags.Add(tag); tags.Add(name, tag);
                    }
                    product.Tags.Add(new ProductTag { Tag = tag });
                }
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        logger.LogInformation("Production catalogue imported: {Categories} categories and {Products} products added; new stock is zero; existing prices and quantities preserved.", createdCategories, createdProducts);
    }
    private sealed record Feed(List<CategoryRow> Categories, List<ProductRow> Products);
    private sealed record CategoryRow(string Name, string Slug, string? ParentSlug, int Depth);
    private sealed record Photo(string Url, string AltText);
    private sealed record ProductRow(string Sku, string Slug, string Name, decimal Price, string Currency,
        string Description, string Category, List<string> Tags, string? SpecsJson, string? SourceName,
        string? SourceUrl, string? SourceLicense, string? PriceBasis, bool NeedsReview, List<Photo> Images);
}
