using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NineCube.Application.Abstractions;
using NineCube.Domain;
using NineCube.Infrastructure.Identity;

namespace NineCube.Infrastructure.Persistence;

/// <summary>
/// Applies migrations and seeds reference data. Everything here is idempotent so it is safe to
/// run on every start-up. Demo accounts are only ever created in Development, and their
/// passwords are read from environment variables - no password is ever committed.
/// </summary>
public static class DatabaseSeeder
{
    public static async Task MigrateAndSeedAsync(
        AppDbContext db,
        IConfiguration configuration,
        bool isDevelopment,
        IPasswordHasherService hasher,
        ILogger logger,
        CancellationToken ct = default)
    {
        logger.LogInformation("Applying EF Core migrations...");
        // Seeding runs before the app accepts traffic, and a cold SQL Server (LocalDB starts on demand)
        // can take well over the default 30 s for its first query. Migrations and seed reads get a longer
        // timeout; request-time commands keep the default.
        db.Database.SetCommandTimeout(TimeSpan.FromSeconds(120));
        await db.Database.MigrateAsync(ct);

        if (!configuration.GetValue("Seed:Enabled", true))
        {
            logger.LogInformation("Seed:Enabled is false - skipping reference data and demo accounts.");
            return;
        }

        await SeedSettingsAsync(db, configuration, ct);
        await SeedProductsAsync(db, ct);
        await SeedCouponsAsync(db, ct);
        await ProductionCatalogImporter.ImportAsync(db, logger, ct);

        // The brand/series facet is derived from rows that already exist (see BrandCatalogImporter), so it
        // runs everywhere and is idempotent; reruns only fill in products added since the last start-up.
        // It is reference data, not a reason to keep the API from starting, so a failure is logged.
        try
        {
            await BrandCatalogImporter.ImportAsync(db, logger, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            db.ChangeTracker.Clear();
            logger.LogWarning(ex, "Brand and series backfill did not complete; it will run again at the next start-up.");
        }

        if (isDevelopment)
        {
            await SeedCoffeeProductImagesAsync(db, ct);
            await SampleCatalogImporter.ImportAsync(db, logger, ct);
            await SeedDemoUsersAsync(db, hasher, logger, ct);
        }
        else
        {
            logger.LogInformation("Skipping demo user seeding (only seeded in Development).");
        }

        // Production administrator bootstrap: creates the first admin from environment
        // variables so the system is never locked out when no admin exists. Idempotent —
        // an existing admin is never overwritten. The password is never committed.
        await SeedProductionAdminAsync(db, hasher, logger, ct);
    }

    private static async Task SeedCouponsAsync(AppDbContext db, CancellationToken ct)
    {
        if (await db.Coupons.AnyAsync(ct)) return;

        db.Coupons.AddRange(
            new Coupon
            {
                Code = "EID2026",
                DiscountType = DiscountType.Percentage,
                DiscountValue = 15,
                MinOrderAmount = 1000,
                MaxDiscountCap = 2500,
                TargetType = CouponTargetType.Category,
                TargetId = 1,
                IsActive = true,
                IsBannerPromoted = true,
                CampaignTitle = "🌙 Eid Mega Festival: 15% OFF Footwear with code EID2026",
                CreatedAt = DateTime.UtcNow
            },
            new Coupon
            {
                Code = "SAVE10",
                DiscountType = DiscountType.Percentage,
                DiscountValue = 10,
                MinOrderAmount = 0,
                MaxDiscountCap = 1500,
                TargetType = CouponTargetType.Order,
                IsActive = true,
                IsBannerPromoted = true,
                CampaignTitle = "⚡ Flash Sale: 10% OFF Storewide with code SAVE10",
                CreatedAt = DateTime.UtcNow
            },
            new Coupon
            {
                Code = "WELCOME50",
                DiscountType = DiscountType.FixedAmount,
                DiscountValue = 50,
                MinOrderAmount = 0,
                TargetType = CouponTargetType.Order,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            },
            new Coupon
            {
                Code = "NINECUBE",
                DiscountType = DiscountType.FixedAmount,
                DiscountValue = 500,
                MinOrderAmount = 2000,
                TargetType = CouponTargetType.Order,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            }
        );

        await db.SaveChangesAsync(ct);
    }

    private static async Task SeedSettingsAsync(AppDbContext db, IConfiguration configuration, CancellationToken ct)
    {
        var threshold = configuration.GetValue("Seed:LowStockThreshold", 5);

        if (!await db.Settings.AnyAsync(s => s.Key == SettingKeys.LowStockThreshold, ct))
        {
            db.Settings.Add(new Setting { Key = SettingKeys.LowStockThreshold, Value = threshold.ToString() });
            await db.SaveChangesAsync(ct);
        }
    }

    private static async Task SeedProductsAsync(AppDbContext db, CancellationToken ct)
    {
        if (await db.Products.AnyAsync(ct)) return;

        var now = DateTime.UtcNow;

        var products = new (string Sku, string Name, decimal Price, decimal? CompareAtPrice, int Stock)[]
        {
            ("NC-1001", "Espresso Machine Pro", 249.00m, 299.00m, 12),
            ("NC-1002", "Milk Frother", 39.90m, 49.90m, 4),
            ("NC-1003", "Burr Coffee Grinder", 89.50m, null, 0),
            ("NC-1004", "Pour Over Kettle", 64.00m, 75.00m, 18),
            ("NC-1005", "Paper Filters (100 pack)", 6.75m, null, 240),
            ("NC-1006", "Ceramic Mug Set", 24.00m, 29.00m, 7),
            ("NC-1007", "Single Origin Beans 1kg", 32.40m, 38.00m, 60),
            ("NC-1008", "Cold Brew Carafe", 45.00m, null, 3),
            ("NC-1009", "Tamper & Mat Bundle", 29.99m, null, 0),
            ("NC-1010", "Reusable Cup", 14.50m, 18.00m, 96)
        };

        var coffeeCategoryId = await db.Categories.Where(c => c.Slug == "coffee-tea").Select(c => c.Id).FirstOrDefaultAsync(ct);

        foreach (var (sku, name, price, compareAtPrice, stock) in products)
        {
            db.Products.Add(new Product
            {
                Sku = sku,
                Name = name,
                ImageUrl = $"/products/{sku.ToLowerInvariant()}.jpg",
                Categories = new List<ProductCategory> { new() { CategoryId = coffeeCategoryId > 0 ? coffeeCategoryId : 1, IsPrimary = true } },
                Price = price,
                CompareAtPrice = compareAtPrice,
                StockQuantity = stock,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        await db.SaveChangesAsync(ct);
    }

    // Backfill only the original demo products that still lack media; preserve merchant edits,
    // prices, live quantities, and any image already assigned through Inventory.
    private static async Task SeedCoffeeProductImagesAsync(AppDbContext db, CancellationToken ct)
    {
        var names = new Dictionary<string, string>
        {
            ["NC-1001"] = "Espresso Machine Pro", ["NC-1002"] = "Milk Frother",
            ["NC-1003"] = "Burr Coffee Grinder", ["NC-1004"] = "Pour Over Kettle",
            ["NC-1005"] = "Paper Filters (100 pack)", ["NC-1006"] = "Ceramic Mug Set",
            ["NC-1007"] = "Single Origin Beans 1kg", ["NC-1008"] = "Cold Brew Carafe",
            ["NC-1009"] = "Tamper & Mat Bundle", ["NC-1010"] = "Reusable Cup"
        };
        var products = await db.Products.Where(p => p.ImageUrl == null || p.ImageUrl == "").ToListAsync(ct);
        foreach (var product in products)
        {
            if (names.TryGetValue(product.Sku, out var name) && product.Name == name)
            {
                product.ImageUrl = $"/products/{product.Sku.ToLowerInvariant()}.jpg";
                product.UpdatedAt = DateTime.UtcNow;
            }
        }
        await db.SaveChangesAsync(ct);
    }

    private static async Task SeedDemoUsersAsync(
        AppDbContext db,
        IPasswordHasherService hasher,
        ILogger logger,
        CancellationToken ct)
    {
        var accounts = new (string Email, UserRole Role, string EnvVar, string Name)[]
        {
            ("customer@ninecube.demo", UserRole.Customer, "NINECUBE_SEED_CUSTOMER_PASSWORD", "Demo Customer"),
            ("staff@ninecube.demo", UserRole.Staff, "NINECUBE_SEED_STAFF_PASSWORD", "Demo Staff"),
            ("inventory@ninecube.demo", UserRole.InventoryManager, "NINECUBE_SEED_INVENTORY_PASSWORD", "Demo Inventory"),
            ("admin@ninecube.demo", UserRole.Administrator, "NINECUBE_SEED_ADMIN_PASSWORD", "Demo Admin")
        };

        var fallback = Environment.GetEnvironmentVariable("NINECUBE_SEED_PASSWORD");
        var missing = new List<string>();

        foreach (var (email, role, envVar, name) in accounts)
        {
            if (await db.Users.AnyAsync(u => u.Email == email, ct)) continue;

            var password = Environment.GetEnvironmentVariable(envVar) ?? fallback;
            if (string.IsNullOrWhiteSpace(password))
            {
                missing.Add(envVar);
                continue;
            }

            var now = DateTime.UtcNow;
            int? customerId = null;

            if (role == UserRole.Customer)
            {
                var existing = await db.Customers.FirstOrDefaultAsync(c => c.Email == email, ct);
                if (existing is null)
                {
                    existing = new Customer { Name = name, Email = email, CreatedAt = now };
                    db.Customers.Add(existing);
                    await db.SaveChangesAsync(ct);
                }
                customerId = existing.Id;
            }

            db.Users.Add(new User
            {
                Email = email,
                PasswordHash = hasher.Hash(password),
                Role = role,
                IsActive = true,
                CustomerId = customerId,
                CreatedAt = now
            });

            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded demo {Role} account {Email}", role, email);
        }

        if (missing.Count > 0)
        {
            logger.LogWarning(
                "Demo accounts not seeded because these environment variables are empty: {Vars}. " +
                "Set NINECUBE_SEED_PASSWORD or the per-role variables to create them.",
                string.Join(", ", missing));
        }
    }

    private static async Task SeedProductionAdminAsync(
        AppDbContext db,
        IPasswordHasherService hasher,
        ILogger logger,
        CancellationToken ct)
    {
        var email = Environment.GetEnvironmentVariable("NINECUBE_ADMIN_EMAIL");
        var password = Environment.GetEnvironmentVariable("NINECUBE_ADMIN_PASSWORD");

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogInformation(
                "Production administrator not seeded. Set NINECUBE_ADMIN_EMAIL and " +
                "NINECUBE_ADMIN_PASSWORD to create the first administrator.");
            return;
        }

        if (await db.Users.AnyAsync(u => u.Email == email, ct))
        {
            logger.LogInformation("Production administrator {Email} already exists; skipping seed.", email);
            return;
        }

        var now = DateTime.UtcNow;
        db.Users.Add(new User
        {
            Email = email,
            PasswordHash = hasher.Hash(password),
            Role = UserRole.Administrator,
            IsActive = true,
            CustomerId = null,
            CreatedAt = now
        });

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded production administrator {Email}", email);
    }
}
