using System.Net;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Infrastructure.Persistence;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// The brand > series filter. Every test runs against real SQL Server through the HTTP pipeline:
/// facet counts must equal the result counts a shopper gets after clicking the option, and the
/// error codes (404 unknown, 400 mismatched pair, 409 assignment) are part of the contract.
/// </summary>
public sealed class BrandCatalogTests(ApiFactory factory) : ApiTestBase(factory)
{
    private async Task<(int Apple, int Iphone17, int Iphone16, int Samsung, int Galaxy)> SeedBrandsAsync()
    {
        return await Factory.WithDbAsync(async db =>
        {
            var apple = new Brand { Name = "Apple", Slug = "apple", CreatedAt = DateTime.UtcNow };
            var samsung = new Brand { Name = "Samsung", Slug = "samsung", CreatedAt = DateTime.UtcNow };
            db.Brands.AddRange(apple, samsung);
            await db.SaveChangesAsync();

            var iphone17 = new ProductLine { BrandId = apple.Id, Name = "iPhone 17", Slug = "iphone-17", SortOrder = 1 };
            var iphone16 = new ProductLine { BrandId = apple.Id, Name = "iPhone 16", Slug = "iphone-16", SortOrder = 2 };
            var galaxy = new ProductLine { BrandId = samsung.Id, Name = "Galaxy S25", Slug = "galaxy-s25", SortOrder = 1 };
            db.ProductLines.AddRange(iphone17, iphone16, galaxy);
            await db.SaveChangesAsync();

            // 3 Apple phones (2 in stock), 1 Samsung, 1 unbranded product.
            db.Products.AddRange(
                Phone("AP-17A", "Apple iPhone 17 256GB Black", 152_000m, apple.Id, iphone17.Id, stock: 4),
                Phone("AP-17B", "Apple iPhone 17 512GB White", 178_000m, apple.Id, iphone17.Id, stock: 2),
                Phone("AP-16A", "Apple iPhone 16 128GB Blue", 118_000m, apple.Id, iphone16.Id, stock: 0),
                Phone("SM-G25", "Samsung Galaxy S25 256GB Silver", 134_000m, samsung.Id, galaxy.Id, stock: 7),
                Phone("ZZ-1", "Generic Power Bank 20000mAh", 2_499m, null, null, stock: 9));

            await db.SaveChangesAsync();
            return (apple.Id, iphone17.Id, iphone16.Id, samsung.Id, galaxy.Id);
        });
    }

    private static Product Phone(string sku, string name, decimal price, int? brandId, int? lineId, int stock) => new()
    {
        Sku = sku,
        Name = name,
        Price = price,
        StockQuantity = stock,
        IsActive = true,
        BrandId = brandId,
        ProductLineId = lineId,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    private async Task<string> TokenAsync() => (await SeedAndLoginAsync("brands@example.com", UserRole.Customer)).Token;

    private async Task<PagedResult<ProductDto>> SearchAsync(string token, string query) =>
        await ReadAsync<PagedResult<ProductDto>>(await GetAsync($"api/products?{query}", token));

    private async Task<IReadOnlyList<BrandDto>> BrandsAsync(string token, string query) =>
        await ReadAsync<IReadOnlyList<BrandDto>>(await GetAsync($"api/brands?{query}", token));

    private async Task<BrandLinesDto> LinesAsync(string token, string slug, string query) =>
        await ReadAsync<BrandLinesDto>(await GetAsync($"api/brands/{slug}/lines?{query}", token));

    [Fact]
    public async Task Brand_facet_counts_equal_the_result_count_for_that_brand()
    {
        await SeedBrandsAsync();
        var token = await TokenAsync();

        var brands = await BrandsAsync(token, string.Empty);
        var facets = brands.ToDictionary(b => b.Slug, b => b.ProductCount);

        facets.Should().Equal(new Dictionary<string, int> { ["apple"] = 3, ["samsung"] = 1 });

        foreach (var (slug, count) in facets)
        {
            var results = await SearchAsync(token, $"brand={slug}");
            results.TotalCount.Should().Be(count, $"clicking {slug} must return exactly the number the facet promised");
        }
    }

    [Fact]
    public async Task Facet_counts_are_taken_with_the_other_active_filters_applied()
    {
        await SeedBrandsAsync();
        var token = await TokenAsync();

        var brands = await BrandsAsync(token, "inStock=true");
        var apple = brands.Single(b => b.Slug == "apple");

        apple.ProductCount.Should().Be(2, "the out-of-stock iPhone 16 is not a result the shopper would get");
        (await SearchAsync(token, "inStock=true&brand=apple")).TotalCount.Should().Be(apple.ProductCount);

        var priced = await BrandsAsync(token, "minPrice=130000&maxPrice=160000");
        priced.Select(b => b.Slug).Should().BeEquivalentTo(["apple", "samsung"]);
        (await SearchAsync(token, "minPrice=130000&maxPrice=160000&brand=samsung")).TotalCount
            .Should().Be(priced.Single(b => b.Slug == "samsung").ProductCount);
    }

    [Fact]
    public async Task Series_facet_counts_match_results_and_a_series_needs_no_brand_parameter()
    {
        await SeedBrandsAsync();
        var token = await TokenAsync();

        var lines = await LinesAsync(token, "apple", string.Empty);

        lines.ProductCount.Should().Be(3);
        lines.Lines.Select(l => (l.Slug, l.ProductCount)).Should().Equal(("iphone-17", 2), ("iphone-16", 1));

        foreach (var line in lines.Lines)
        {
            (await SearchAsync(token, $"line={line.Slug}")).TotalCount.Should().Be(line.ProductCount);
            (await SearchAsync(token, $"brand=apple&line={line.Slug}")).TotalCount.Should().Be(line.ProductCount);
        }

        // A series implies its brand, so the brand filter is not required to reach the same rows.
        var withBoth = await SearchAsync(token, "line=iphone-17");
        withBoth.Items.Select(p => p.Id).Should().BeEquivalentTo(
            (await SearchAsync(token, "brand=apple&line=iphone-17")).Items.Select(p => p.Id));
    }

    [Fact]
    public async Task Series_facet_respects_the_other_filters_and_only_lists_series_with_results()
    {
        await SeedBrandsAsync();
        var token = await TokenAsync();

        var lines = await LinesAsync(token, "apple", "inStock=true");

        lines.ProductCount.Should().Be(2);
        lines.Lines.Select(l => l.Slug).Should().BeEquivalentTo(["iphone-17"]);
        lines.Lines.Single().ProductCount.Should().Be(2);
        (await SearchAsync(token, "inStock=true&brand=apple&line=iphone-17")).TotalCount.Should().Be(2);
    }

    [Fact]
    public async Task Multiple_brands_combine_as_a_union()
    {
        await SeedBrandsAsync();
        var token = await TokenAsync();

        var both = await SearchAsync(token, "brand=apple&brand=samsung");

        both.TotalCount.Should().Be(4);
        both.Items.Select(p => p.BrandSlug).Distinct().Should().BeEquivalentTo(["apple", "samsung"]);
    }

    [Fact]
    public async Task Unknown_brand_or_series_is_404_not_an_empty_page()
    {
        await SeedBrandsAsync();
        var token = await TokenAsync();

        foreach (var url in new[]
                 {
                     "api/products?brand=nokia",
                     "api/products?line=nokia-9",
                     "api/products?brand=apple&line=nokia-9",
                     "api/brands/nokia/lines"
                 })
        {
            var response = await GetAsync(url, token);
            response.StatusCode.Should().Be(HttpStatusCode.NotFound, url);
            (await ReadJsonAsync(response)).GetProperty("code").GetString().Should().Be("not_found", url);
        }
    }

    [Fact]
    public async Task Series_from_another_brand_is_a_bad_request()
    {
        await SeedBrandsAsync();
        var token = await TokenAsync();

        var response = await GetAsync("api/products?brand=samsung&line=iphone-17", token);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await ReadJsonAsync(response);
        problem.GetProperty("code").GetString().Should().Be("invalid_request");
        problem.GetProperty("detail").GetString().Should().Contain("series");
    }

    [Fact]
    public async Task Assigning_a_series_that_belongs_to_another_brand_conflicts()
    {
        var (apple, _, _, samsung, galaxy) = await SeedBrandsAsync();
        var token = (await SeedAndLoginAsync("brand-admin@example.com", UserRole.InventoryManager)).Token;

        // A series always belongs to one brand, so pairing it with a different brand is refused.
        var response = await PostAsync("api/products",
            new CreateProductRequest("MIX-1", "Mismatched Phone", 1000m, true, null, null, apple, galaxy), token);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ReadJsonAsync(response)).GetProperty("code").GetString().Should().Be("brand_line_mismatch");

        var ok = await PostAsync("api/products",
            new CreateProductRequest("MIX-2", "Matched Phone", 1000m, true, null, null, samsung, galaxy), token);
        ok.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await ReadAsync<ProductDto>(ok);
        created.BrandSlug.Should().Be("samsung");
        created.ProductLineSlug.Should().Be("galaxy-s25");

        // The series alone is enough: its brand is inferred, and the unknown id case is a 404.
        var unknown = await PostAsync("api/products",
            new CreateProductRequest("MIX-3", "Unknown Brand Phone", 1000m, true, null, null, 9999, null), token);
        unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Backfill_derives_brands_from_tags_and_series_from_names_without_inventing_models()
    {
        var report = await Factory.WithDbAsync(async db =>
        {
            var tag = new Tag { Name = "Brand: Apple" };
            db.Tags.Add(tag);
            await db.SaveChangesAsync();

            var phone = Phone("BF-1", "Apple iPhone 13 128GB (a15)", 92_000m, null, null, stock: 3);
            var tablet = Phone("BF-2", "Apple iPad Air (a16)", 61_000m, null, null, stock: 1);
            var plain = Phone("BF-3", "Generic USB Cable 1 m", 350m, null, null, stock: 40);
            var display = Phone("BF-4", "Apple Studio Display 27 inch", 145_000m, null, null, stock: 2);
            db.Products.AddRange(phone, tablet, plain, display);
            await db.SaveChangesAsync();

            db.ProductTags.Add(new ProductTag { ProductId = phone.Id, TagId = tag.Id });
            db.ProductTags.Add(new ProductTag { ProductId = display.Id, TagId = tag.Id });
            await db.SaveChangesAsync();

            return await BrandCatalogImporter.ImportAsync(db, NullLogger.Instance, CancellationToken.None);
        });

        report.BrandsCreated.Should().Be(1);
        report.ProductsWithBrand.Should().Be(2, "only the products carrying the Brand: Apple tag are branded");
        report.ProductsWithoutBrand.Should().HaveCount(2);

        var lines = await Factory.QueryAsync(db => db.ProductLines
            .Where(l => l.Brand!.Slug == "apple")
            .Select(l => l.Name).ToListAsync());

        // "13" is the model; "27 inch" measures the screen, so the series stops before it.
        lines.Should().BeEquivalentTo(["iPhone 13", "Studio Display"], "series come from real names only - no invented models");

        // Re-running the importer is a no-op: it never renames or duplicates what it already created.
        var again = await Factory.WithDbAsync(db => BrandCatalogImporter.ImportAsync(db, NullLogger.Instance, CancellationToken.None));
        again.BrandsCreated.Should().Be(0);
        again.LinesCreated.Should().Be(0);
    }
}
