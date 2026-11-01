using Microsoft.EntityFrameworkCore;
using NineCube.Infrastructure.Persistence;

namespace NineCube.Tests.Infrastructure;

/// <summary>
/// One PostgreSQL container shared by every test in a class, plus the options that build a real
/// AppDbContext against it. The schema comes from the same model the app migrates with, so a scope
/// rule written here is written the way production writes it.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgresTestDatabase _database = new();

    public DbContextOptions<AppDbContext> Options { get; private set; } = null!;

    public string Mode => _database.Mode;

    public AppDbContext NewDbContext() => new(Options);

    public async Task InitializeAsync()
    {
        await _database.InitializeAsync();

        Options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(PostgresConnectionConfiguration.Normalize(_database.ConnectionString),
                npgsql => npgsql.UseQuerySplittingBehavior(QuerySplittingBehavior.SingleQuery))
            .ConfigureWarnings(warnings =>
            {
                warnings.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning);
                warnings.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.MultipleCollectionIncludeWarning);
            })
            .Options;

        await using var db = NewDbContext();
        await db.Database.EnsureCreatedAsync();
    }

    /// <summary>Empties the tables a scope test touches so each test starts from the same catalogue.</summary>
    public async Task ResetAsync()
    {
        await using var db = NewDbContext();

        // Coupons cascade their rules; the catalogue rows have no coupon dependency.
        await db.Coupons.ExecuteDeleteAsync();
        await db.Orders.ExecuteDeleteAsync();
        await db.Products.ExecuteDeleteAsync();
        await db.ProductLines.ExecuteDeleteAsync();
        await db.Brands.ExecuteDeleteAsync();
        await db.Tags.ExecuteDeleteAsync();
        await db.Categories.ExecuteDeleteAsync();
    }

    public async Task DisposeAsync()
    {
        try
        {
            await using var db = NewDbContext();
            await db.Database.EnsureDeletedAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PostgresFixture] warning: could not drop the schema: {ex.Message}");
        }

        await _database.DisposeAsync();
    }
}
