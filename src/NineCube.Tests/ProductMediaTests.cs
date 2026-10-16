using System.Net;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NineCube.Application.Abstractions;
using NineCube.Infrastructure.Persistence;

namespace NineCube.Tests;

public sealed class ProductMediaTests(ApiFactory factory) : ApiTestBase(factory)
{
    [Fact]
    public async Task Demo_image_backfill_preserves_stock_prices_and_custom_images_on_repeat_runs()
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var grinder = new Product { Sku = "NC-1003", Name = "Burr Coffee Grinder", Price = 89.50m, StockQuantity = 7, IsActive = true };
        var mug = new Product { Sku = "NC-1006", Name = "Ceramic Mug Set", Price = 24m, StockQuantity = 3, ImageUrl = "/products/custom.jpg", IsActive = true };
        var renamed = new Product { Sku = "NC-1008", Name = "Merchant Carafe", Price = 60m, StockQuantity = 2, IsActive = true };
        // Mark the sample feed as already imported so this regression test never uses the network.
        db.Products.AddRange(grinder, mug, renamed, new Product { Sku = "DJ-test", Name = "Existing sample", Price = 1m, IsActive = true });
        await db.SaveChangesAsync();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Seed:Enabled"] = "true" }).Build();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasherService>();
        await DatabaseSeeder.MigrateAndSeedAsync(db, config, true, hasher, NullLogger.Instance);
        grinder.ImageUrl.Should().Be("/products/nc-1003.jpg");
        grinder.StockQuantity.Should().Be(7);
        grinder.Price.Should().Be(89.50m);
        mug.ImageUrl.Should().Be("/products/custom.jpg");
        renamed.ImageUrl.Should().BeNull();
        var updated = grinder.UpdatedAt;
        await DatabaseSeeder.MigrateAndSeedAsync(db, config, true, hasher, NullLogger.Instance);
        grinder.UpdatedAt.Should().Be(updated);
        grinder.StockQuantity.Should().Be(7);
        mug.ImageUrl.Should().Be("/products/custom.jpg");
    }

    [Fact]
    public async Task Images_and_descriptions_round_trip_through_create_update_and_catalogue()
    {
        var (_, token) = await SeedAndLoginAsync("media@example.com", UserRole.InventoryManager);
        var response = await PostAsync("api/products", new CreateProductRequest(
            "IMAGE-1", "Bamboo Spatula", 7.99m, true, "Kitchen utensil", "/products/48.webp"), token);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await ReadAsync<ProductDto>(response);
        created.ImageUrl.Should().Be("/products/48.webp");
        created.Description.Should().Be("Kitchen utensil");
        var update = Request(HttpMethod.Put, $"api/products/{created.Id}", new UpdateProductRequest(
            "Bamboo Spatula", 8.99m, true, "Updated description", "https://example.com/spatula.webp"), token);
        (await Client.SendAsync(update)).StatusCode.Should().Be(HttpStatusCode.OK);
        var loaded = await ReadAsync<ProductDto>(await GetAsync($"api/products/{created.Id}", token));
        loaded.ImageUrl.Should().Be("https://example.com/spatula.webp");
        loaded.Description.Should().Be("Updated description");
        loaded.StockQuantity.Should().Be(0);
        var list = await ReadAsync<PagedResult<ProductDto>>(await GetAsync("api/products?q=Bamboo", token));
        list.Items.Single().ImageUrl.Should().Be(loaded.ImageUrl);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("http://example.com/image.png")]
    [InlineData("/products/../private")]
    public async Task Invalid_image_urls_return_validation_errors(string imageUrl)
    {
        var (_, token) = await SeedAndLoginAsync("bad-media@example.com", UserRole.InventoryManager);
        var response = await PostAsync("api/products", new CreateProductRequest(
            "BAD-IMAGE", "Invalid image", 1m, true, null, imageUrl), token);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJsonAsync(response)).GetProperty("code").GetString().Should().Be("invalid_request");
    }
}
