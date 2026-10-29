using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NineCube.Application.Abstractions;
using NineCube.Domain;
using NineCube.Infrastructure.Persistence;
using Npgsql;

internal static class CatalogueStockChecks
{
    public static async Task RunAsync(string connection, Action<bool, string> check)
    {
        // Only the disposable CI database is allowed. Never clear a merchant database.
        if (new NpgsqlConnectionStringBuilder(connection).Database != "ninecube_catalogue_checks")
            throw new InvalidOperationException("Catalogue checks require the dedicated test database.");
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).Options);
        await db.Database.EnsureDeletedAsync();
        await db.Database.MigrateAsync();
        using var stream = typeof(ProductionCatalogImporter).Assembly.GetManifestResourceStream(
            "NineCube.Infrastructure.Persistence.production-catalogue.json")!;
        using var feed = await JsonDocument.ParseAsync(stream);
        var rows = feed.RootElement.GetProperty("products").EnumerateArray().ToArray();
        var positive = rows.Where(p => p.GetProperty("stockQuantity").GetInt32() > 0).Take(5).ToArray();
        var fixtures = positive.Select(p => new Product { Sku = p.GetProperty("sku").GetString()!,
            Slug = p.GetProperty("slug").GetString()!, Name = "Merchant name", Price = 123.45m,
            StockQuantity = 0, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }).ToArray();
        fixtures[1].StockQuantity = 9;
        db.Products.AddRange(fixtures);
        await db.SaveChangesAsync();
        db.InventoryMovements.Add(new InventoryMovement { ProductId = fixtures[2].Id, Delta = -1,
            Reason = "Previously sold out", CreatedAt = DateTime.UtcNow });
        db.AuditLogs.Add(new AuditLog { Action = AuditActions.ProductUpdated, EntityType = nameof(Product),
            EntityId = fixtures[3].Id.ToString(), CreatedAt = DateTime.UtcNow });
        db.Orders.Add(new Order { Customer = new Customer { Name = "Test", Email = "test@example.test" },
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            Items = [new OrderItem { ProductId = fixtures[4].Id, Quantity = 1, UnitPrice = 1, LineTotal = 1 }] });
        await db.SaveChangesAsync();

        await ProductionCatalogImporter.ImportAsync(db, NullLogger.Instance);
        db.ChangeTracker.Clear();
        var products = await db.Products.AsNoTracking().ToDictionaryAsync(p => p.Sku);
        var restored = products[fixtures[0].Sku];
        check(restored.StockQuantity == positive[0].GetProperty("stockQuantity").GetInt32(), "Omitted seed stock restored");
        check(restored.Name == "Merchant name" && restored.Price == 123.45m, "Merchant name and price preserved");
        check(products[fixtures[1].Sku].StockQuantity == 9, "Existing positive stock preserved");
        check(products[fixtures[2].Sku].StockQuantity == 0, "Sold-out stock with movements preserved");
        check(products[fixtures[3].Sku].StockQuantity == 0, "Audited merchant product preserved");
        check(products[fixtures[4].Sku].StockQuantity == 0, "Product with order history preserved");
        var fixtureSkus = fixtures.Select(p => p.Sku).ToHashSet();
        check(rows.Where(p => !fixtureSkus.Contains(p.GetProperty("sku").GetString()!)).All(p =>
            products[p.GetProperty("sku").GetString()!].StockQuantity == p.GetProperty("stockQuantity").GetInt32()),
            "Every new product uses its exact seed quantity, including zero");
        check(await db.InventoryMovements.Where(m => m.ProductId == restored.Id).SumAsync(m => m.Delta) == restored.StockQuantity,
            "Restoration writes matching inventory ledger");
        check(await db.AuditLogs.AnyAsync(a => a.EntityId == restored.Id.ToString() && a.Action == AuditActions.StockAdjusted),
            "Restoration writes audit record");
        var movements = await db.InventoryMovements.CountAsync();
        var audits = await db.AuditLogs.CountAsync();
        await ProductionCatalogImporter.ImportAsync(db, NullLogger.Instance);
        check(await db.InventoryMovements.CountAsync() == movements && await db.AuditLogs.CountAsync() == audits,
            "Repeated import does not duplicate stock, movements or audit records");
        // Even a zero with no ledger cannot be replenished after the one-time repair.
        await db.InventoryMovements.Where(m => m.ProductId == restored.Id).ExecuteDeleteAsync();
        await db.AuditLogs.Where(a => a.EntityId == restored.Id.ToString()).ExecuteDeleteAsync();
        await db.Products.Where(p => p.Id == restored.Id).ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, 0));
        db.ChangeTracker.Clear();
        await ProductionCatalogImporter.ImportAsync(db, NullLogger.Instance);
        check(await db.Products.Where(p => p.Id == restored.Id).Select(p => p.StockQuantity).SingleAsync() == 0,
            "Completion marker prevents later replenishment");

        var laptopSkus = rows.Where(p => p.GetProperty("category").GetString() == "laptops")
            .Select(p => p.GetProperty("sku").GetString()!).ToArray();
        var laptops = await db.Products.AsNoTracking().Where(p => laptopSkus.Contains(p.Sku)).ToListAsync();
        check(laptops.Count == 12 && laptops.All(p => p.StockQuantity == 10), "All twelve new laptops open with ten units");
        var laptopIds = laptops.Select(p => p.Id).ToArray();
        // Recreate the already-deployed state: original repair complete, laptops seeded at zero.
        await db.Settings.Where(s => s.Key == "ProductionCatalogue.LaptopStockInitialization.v1").ExecuteDeleteAsync();
        await db.InventoryMovements.Where(m => laptopIds.Contains(m.ProductId)).ExecuteDeleteAsync();
        await db.Products.Where(p => laptopIds.Contains(p.Id)).ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, 0));
        var preservedId = laptops[0].Id;
        await db.Products.Where(p => p.Id == preservedId).ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, 4));
        db.ChangeTracker.Clear();
        await ProductionCatalogImporter.ImportAsync(db, NullLogger.Instance);
        check(await db.Products.Where(p => laptopIds.Contains(p.Id) && p.Id != preservedId).AllAsync(p => p.StockQuantity == 10),
            "Laptop update applies after original production stock repair already completed");
        check(await db.Products.Where(p => p.Id == preservedId).Select(p => p.StockQuantity).SingleAsync() == 4,
            "Laptop update preserves existing positive stock");
        var restockedId = laptops[1].Id;
        check(await db.InventoryMovements.Where(m => m.ProductId == restockedId).SumAsync(m => m.Delta) == 10
            && await db.AuditLogs.AnyAsync(a => a.EntityType == nameof(Product) && a.EntityId == restockedId.ToString()
                && a.Action == AuditActions.StockAdjusted), "Laptop update writes inventory and audit records");
        var laptopMovementCount = await db.InventoryMovements.Where(m => laptopIds.Contains(m.ProductId)).CountAsync();
        await db.Products.Where(p => p.Id == restockedId).ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, 0));
        db.ChangeTracker.Clear();
        await ProductionCatalogImporter.ImportAsync(db, NullLogger.Instance);
        check(await db.Products.Where(p => p.Id == restockedId).Select(p => p.StockQuantity).SingleAsync() == 0
            && await db.InventoryMovements.Where(m => laptopIds.Contains(m.ProductId)).CountAsync() == laptopMovementCount,
            "Laptop sell-out stays zero on later imports without duplicate movements");
        check(await db.Products.Where(p => p.Id == restored.Id).Select(p => p.StockQuantity).SingleAsync() == 0,
            "Laptop update leaves non-laptop stock unchanged");
    }
}
