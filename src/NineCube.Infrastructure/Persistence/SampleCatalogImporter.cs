using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NineCube.Domain;

namespace NineCube.Infrastructure.Persistence;

/// <summary>Development-only sample feed. Imports missing SKUs once; never resets live stock.</summary>
internal static class SampleCatalogImporter
{
    public static async Task ImportAsync(AppDbContext db, ILogger logger, CancellationToken ct)
    {
        var existing = await db.Products.Select(p => p.Sku).ToListAsync(ct);
        // Avoid any external dependency once this catalogue has been imported.
        if (existing.Any(s => s.StartsWith("DJ-"))) return;
        Feed? feed;
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            feed = await client.GetFromJsonAsync<Feed>(
                "https://dummyjson.com/products/category/kitchen-accessories?limit=16", ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            ct.ThrowIfCancellationRequested();
            logger.LogWarning("Sample catalogue feed unavailable; using the bundled snapshot.");
            using var stream = typeof(SampleCatalogImporter).Assembly.GetManifestResourceStream(
                "NineCube.Infrastructure.Persistence.catalogue.json")!;
            feed = await JsonSerializer.DeserializeAsync<Feed>(stream,
                new JsonSerializerOptions(JsonSerializerDefaults.Web), ct);
        }
        if (feed?.Products is not { Count: > 0 }) return;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var kitchenCategoryId = await db.Categories.Where(c => c.Slug == "kitchen").Select(c => c.Id).FirstOrDefaultAsync(ct);
        foreach (var item in feed.Products)
        {
            var sku = $"DJ-{item.Id}";
            if (existing.Contains(sku) || item.Price < 0 || item.Stock < 0 || string.IsNullOrWhiteSpace(item.Title)) continue;
            var product = new Product {
                Sku = sku, Name = item.Title, Description = item.Description,
                Categories = new List<ProductCategory> { new() { CategoryId = kitchenCategoryId > 0 ? kitchenCategoryId : 1, IsPrimary = true } },
                ImageUrl = $"/products/{item.Id}.webp", Price = item.Price,
                StockQuantity = item.Stock, IsActive = true,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
            };
            db.Products.Add(product);
            await db.SaveChangesAsync(ct);
            db.InventoryMovements.Add(new InventoryMovement {
                ProductId = product.Id, Delta = item.Stock, Reason = "Opening stock from development sample catalogue",
                CreatedAt = DateTime.UtcNow
            });
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        logger.LogInformation("Imported development sample products with descriptions and images.");
    }
    private sealed record Feed(List<FeedProduct> Products);
    private sealed record FeedProduct(int Id, string Title, string Description, decimal Price, int Stock);
}
