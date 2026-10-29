using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Infrastructure.Persistence;

/// <summary>Offline, additive catalogue import with a one-time repair of uninitialized seed stock.</summary>
public static class ProductionCatalogImporter
{
    private const string StockRepairKey = "ProductionCatalogue.StockInitialization.v1";

    public static async Task ImportAsync(AppDbContext db, ILogger logger, CancellationToken ct = default)
    {
        using var stream = typeof(ProductionCatalogImporter).Assembly.GetManifestResourceStream(
            "NineCube.Infrastructure.Persistence.production-catalogue.json")
            ?? throw new InvalidOperationException("Bundled production catalogue is missing.");
        var feed = await JsonSerializer.DeserializeAsync<Feed>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web), ct)
            ?? throw new InvalidOperationException("Bundled production catalogue is invalid.");
        if (feed.Products.Any(p => p.StockQuantity < 0))
            throw new InvalidOperationException("Bundled production catalogue contains negative stock.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Serialize rolling-deployment importers against the same PostgreSQL database.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(846239105)", ct);
        var repairStock = !await db.Settings.AnyAsync(s => s.Key == StockRepairKey, ct);
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
        var restoredProducts = 0;
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
                    Price = item.Price, Currency = item.Currency, StockQuantity = item.StockQuantity, IsActive = true,
                    CreatedAt = now, UpdatedAt = now, NeedsReview = item.NeedsReview };
                db.Products.Add(product); createdProducts++;
                bySku.Add(product.Sku, product); bySlug.Add(product.Slug, product);
                if (item.StockQuantity > 0)
                    db.InventoryMovements.Add(new InventoryMovement { Product = product, Delta = item.StockQuantity,
                        Reason = "Opening stock from bundled production catalogue", CreatedAt = now });
            }
            else if (repairStock && item.StockQuantity > 0)
            {
                // The old importer initialized everything to zero. Repair only untouched rows.
                // The conditional UPDATE locks the product against concurrent reservations/adjustments.
                // A movement or order proves that zero may be legitimate and must be preserved.
                var id = product.Id;
                var entityId = id.ToString();
                var restored = await db.Products.Where(p => p.Id == id && p.StockQuantity == 0
                        && !db.InventoryMovements.Any(m => m.ProductId == p.Id)
                        && !db.OrderItems.Any(o => o.ProductId == p.Id)
                        && !db.AuditLogs.Any(a => a.EntityType == nameof(Product) && a.EntityId == entityId))
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, item.StockQuantity)
                        .SetProperty(p => p.UpdatedAt, now), ct);
                if (restored > 0)
                {
                    // Keep EF's snapshot in sync without issuing a second stock write at SaveChanges.
                    var entry = db.Entry(product);
                    entry.Property(p => p.StockQuantity).CurrentValue = item.StockQuantity;
                    entry.Property(p => p.StockQuantity).OriginalValue = item.StockQuantity;
                    entry.Property(p => p.UpdatedAt).CurrentValue = now;
                    entry.Property(p => p.UpdatedAt).OriginalValue = now;
                    db.InventoryMovements.Add(new InventoryMovement { ProductId = id, Delta = item.StockQuantity,
                        Reason = "Restore seed stock omitted by production catalogue import v1", CreatedAt = now });
                    db.AuditLogs.Add(new AuditLog { Action = AuditActions.StockAdjusted,
                        EntityType = nameof(Product), EntityId = entityId, CreatedAt = now,
                        Details = $"delta={item.StockQuantity}; reason=production catalogue stock initialization v1" });
                    restoredProducts++;
                }
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
        if (repairStock)
            db.Settings.Add(new Setting { Key = StockRepairKey, Value = DateTime.UtcNow.ToString("O") });
        await db.SaveChangesAsync(ct);
        await InitializeLaptopStockAsync(db, feed.Products, logger, ct);
        await transaction.CommitAsync(ct);
        logger.LogInformation("Production catalogue imported: {Categories} categories and {Products} products added; {Restored} uninitialized stock quantities restored; merchant stock changes preserved.", createdCategories, createdProducts, restoredProducts);
    }

    private static async Task InitializeLaptopStockAsync(AppDbContext db, List<ProductRow> products, ILogger logger, CancellationToken ct)
    {
        const string key = "ProductionCatalogue.LaptopStockInitialization.v1";
        if (await db.Settings.AnyAsync(s => s.Key == key, ct)) return;

        // The merchant requested opening stock of ten for the twelve laptop models.
        // Runs under the importer's transaction/advisory lock. Never overwrites positive stock
        // and never replenishes a later sell-out on subsequent deployments.
        var initialized = 0;
        foreach (var item in products.Where(p => p.Category == "laptops" && p.StockQuantity > 0))
        {
            var product = await db.Products.AsNoTracking().Where(p => p.Sku == item.Sku)
                .Select(p => new { p.Id }).SingleAsync(ct);
            var now = DateTime.UtcNow;
            var affected = await db.Products.Where(p => p.Id == product.Id && p.StockQuantity == 0)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, item.StockQuantity)
                    .SetProperty(p => p.UpdatedAt, now), ct);
            if (affected == 0) continue;

            var entry = db.ChangeTracker.Entries<Product>().Single(e => e.Entity.Id == product.Id);
            entry.Property(p => p.StockQuantity).CurrentValue = item.StockQuantity;
            entry.Property(p => p.StockQuantity).OriginalValue = item.StockQuantity;
            entry.Property(p => p.UpdatedAt).CurrentValue = now;
            entry.Property(p => p.UpdatedAt).OriginalValue = now;
            db.InventoryMovements.Add(new InventoryMovement { ProductId = product.Id, Delta = item.StockQuantity,
                Reason = "Merchant-requested laptop opening stock: 10 units per model", CreatedAt = now });
            db.AuditLogs.Add(new AuditLog { Action = AuditActions.StockAdjusted, EntityType = nameof(Product),
                EntityId = product.Id.ToString(), CreatedAt = now,
                Details = $"delta={item.StockQuantity}; reason=laptop stock initialization v1" });
            initialized++;
        }
        db.Settings.Add(new Setting { Key = key, Value = DateTime.UtcNow.ToString("O") });
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Initialized opening stock for {Count} laptop models; existing positive stock preserved.", initialized);
    }

    private sealed record Feed(List<CategoryRow> Categories, List<ProductRow> Products);
    private sealed record CategoryRow(string Name, string Slug, string? ParentSlug, int Depth);
    private sealed record Photo(string Url, string AltText);
    private sealed record ProductRow(string Sku, string Slug, string Name, decimal Price, string Currency, int StockQuantity,
        string Description, string Category, List<string> Tags, string? SpecsJson, string? SourceName,
        string? SourceUrl, string? SourceLicense, string? PriceBasis, bool NeedsReview, List<Photo> Images);
}
