using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NineCube.Application.Abstractions;
using NineCube.Domain;
using NineCube.Infrastructure.Identity;
using NineCube.Infrastructure.Persistence;

namespace NineCube.Tests.Infrastructure;

/// <summary>
/// Hosts the real API in-process against the throwaway test database. Nothing is mocked: the
/// controllers, the services, EF Core, SQL Server transactions and the CHECK constraints are all
/// the production code paths.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string SigningKey = "ninecube-integration-test-signing-key-0123456789";
    public const string Issuer = "NineCube.Tests";
    public const string Audience = "NineCube.Tests.Client";

    /// <summary>
    /// The factory owns the database because xUnit v2 cannot inject a collection fixture into
    /// another collection fixture, and the connection string has to be known before the app builds.
    /// </summary>
    public TestDatabase Database { get; } = new();

    public ApiFactory()
    {
        // xUnit runs on a thread pool thread with no SynchronizationContext, so blocking here cannot deadlock.
        Database.InitializeAsync().GetAwaiter().GetResult();

        // Environment variables are the most reliable override for the minimal hosting model:
        // they are applied on top of appsettings*.json and are read while the app is being built.
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", Database.ConnectionString);
        Environment.SetEnvironmentVariable("Jwt__SigningKey", SigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", Issuer);
        Environment.SetEnvironmentVariable("Jwt__Audience", Audience);
        Environment.SetEnvironmentVariable("Seed__Enabled", "false");
    }

    public string DatabaseMode => Database.Mode;

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await Database.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Default"] = Database.ConnectionString,
            ["Jwt:SigningKey"] = SigningKey,
            ["Jwt:Issuer"] = Issuer,
            ["Jwt:Audience"] = Audience,
            ["Seed:Enabled"] = "false"
        }));
    }

    // ------------------------------------------------------------------ data helpers

    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM Notifications;
            DELETE FROM Addresses;
            DELETE FROM InventoryMovements;
            DELETE FROM OrderItems;
            DELETE FROM Orders;
            DELETE FROM AuditLogs;
            DELETE FROM ProductImages;
            DELETE FROM Products;
            DELETE FROM ProductLines;
            DELETE FROM Brands;
            DELETE FROM Users;
            DELETE FROM Customers;
            DELETE FROM Settings;
            DELETE FROM Categories WHERE Depth = 4;
            DELETE FROM Categories WHERE Depth = 3 AND Id NOT IN (4,7);
            DELETE FROM Categories WHERE Depth = 2 AND Id NOT IN (3,6);
            DELETE FROM Categories WHERE Depth = 1 AND Id NOT IN (1,2,5);
            DELETE FROM Tags;
            """);
    }

    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await action(db);
    }

    public Task<T> QueryAsync<T>(Func<AppDbContext, Task<T>> query) => WithDbAsync(query);

    public async Task<Product> SeedProductAsync(string sku, decimal price, int stock, bool isActive = true)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var product = new Product
        {
            Sku = sku,
            Name = $"Test product {sku}",
            Price = price,
            StockQuantity = stock,
            IsActive = isActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product;
    }

    public async Task<User> SeedUserAsync(string email, string password, UserRole role)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasherService>();

        var now = DateTime.UtcNow;
        int? customerId = null;

        if (role == UserRole.Customer)
        {
            var customer = new Customer { Name = email, Email = email.ToLowerInvariant(), CreatedAt = now };
            db.Customers.Add(customer);
            await db.SaveChangesAsync();
            customerId = customer.Id;
        }

        var user = new User
        {
            Email = email.ToLowerInvariant(),
            PasswordHash = hasher.Hash(password),
            Role = role,
            IsActive = true,
            CustomerId = customerId,
            CreatedAt = now
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    public async Task<int?> GetCustomerIdAsync(int userId) =>
        await WithDbAsync(db => db.Users.Where(u => u.Id == userId).Select(u => u.CustomerId).FirstOrDefaultAsync());

    public async Task<int> GetStockAsync(int productId) =>
        await WithDbAsync(db => db.Products.Where(p => p.Id == productId).Select(p => p.StockQuantity).FirstAsync());

    public async Task<int> CountOrdersAsync() =>
        await WithDbAsync(db => db.Orders.CountAsync());

    public async Task<int> CountOrdersForCustomerAsync(int customerId) =>
        await WithDbAsync(db => db.Orders.CountAsync(o => o.CustomerId == customerId));

    public async Task<int> CountInventoryMovementsAsync(int productId) =>
        await WithDbAsync(db => db.InventoryMovements.CountAsync(m => m.ProductId == productId));

    public async Task<int> SumMovementDeltaAsync(int productId) =>
        await WithDbAsync(db => db.InventoryMovements.Where(m => m.ProductId == productId).SumAsync(m => m.Delta));

    public async Task<int> SumOrderItemQuantitiesAsync()
    {
        var total = await WithDbAsync(db => db.OrderItems.SumAsync(i => (int?)i.Quantity));
        return total ?? 0;
    }

    public async Task<OrderStatus> GetOrderStatusAsync(int orderId) =>
        await WithDbAsync(db => db.Orders.Where(o => o.Id == orderId).Select(o => o.Status).FirstAsync());
}
