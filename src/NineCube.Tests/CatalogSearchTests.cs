using System.Net;
using System.Net.Http;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// What a shopper gets from the catalogue search box. The ranked passes (name, then SKU, then the
/// description / brand / category secondary pass), the literal wildcards and the Bengali behaviour are
/// the contract here, so every test runs through the real HTTP pipeline against real PostgreSQL.
/// </summary>
public sealed class CatalogSearchTests(ApiFactory factory) : ApiTestBase(factory)
{
    private async Task<string> TokenAsync() => (await SeedAndLoginAsync("search@example.com", UserRole.Customer)).Token;

    private async Task<List<string>> NamesAsync(string token, string query)
    {
        var response = await GetAsync($"api/products?{query}", token);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return (await ReadAsync<PagedResult<ProductDto>>(response)).Items.Select(i => i.Name).ToList();
    }

    private async Task<int> TotalAsync(string token, string query) =>
        (await ReadAsync<PagedResult<ProductDto>>(await GetAsync($"api/products?{query}", token))).TotalCount;

    private static string Q(string search, params string[] extra) =>
        "q=" + Uri.EscapeDataString(search) + string.Concat(extra.Select(e => "&" + e));

    private static Product Item(string sku, string name, decimal price, string? description = null, int? brandId = null) => new()
    {
        Sku = sku,
        Name = name,
        Price = price,
        Description = description,
        StockQuantity = 5,
        IsActive = true,
        BrandId = brandId,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    private async Task SeedAsync(params Product[] products) =>
        await Factory.WithDbAsync(async db =>
        {
            db.Products.AddRange(products);
            await db.SaveChangesAsync();
            return products.Length;
        });

    [Fact]
    public async Task A_name_hit_comes_before_a_sku_hit_which_comes_before_a_description_hit()
    {
        await SeedAsync(
            Item("ZB-1", "Zebra Shoe Brush", 40m, "Dusts brushes"),
            Item("SHOE-11", "Alpha Wall Hook", 10m, "Holds coats"),
            Item("BT-1", "Beta Towel", 20m, "Cotton shoe bag"));

        var names = await NamesAsync(await TokenAsync(), Q("shoe"));

        // Alphabetical order would put Beta and Alpha first; relevance puts the name match on top.
        names.Should().Equal("Zebra Shoe Brush", "Alpha Wall Hook", "Beta Towel");
    }

    [Fact]
    public async Task The_shoppers_sort_still_orders_products_inside_each_pass()
    {
        await SeedAsync(
            Item("N-1", "Shoe Rack Small", 15m, "Bamboo"),
            Item("N-2", "Shoe Rack Large", 5m, "Bamboo"),
            Item("D-1", "Cabinet", 1m, "Stores shoe"));

        var names = await NamesAsync(await TokenAsync(), Q("shoe", "sort=price"));

        names.Should().Equal("Shoe Rack Large", "Shoe Rack Small", "Cabinet");
    }

    [Fact]
    public async Task A_percent_sign_in_a_search_is_a_character_not_a_wildcard()
    {
        await SeedAsync(
            Item("TC-1", "T-Shirt 100% Cotton", 9m),
            Item("PC-1", "Power Cell 1000 mAh", 19m));

        var names = await NamesAsync(await TokenAsync(), Q("100%"));

        names.Should().Equal("T-Shirt 100% Cotton");
    }

    [Fact]
    public async Task An_underscore_in_a_search_does_not_stand_for_any_letter()
    {
        await SeedAsync(Item("AB-1", "A_B Bracket", 3m), Item("AX-1", "AXB Bracket", 4m));

        var names = await NamesAsync(await TokenAsync(), Q("a_b"));

        names.Should().Equal("A_B Bracket");
    }

    [Fact]
    public async Task A_bengali_word_finds_the_product_named_in_english()
    {
        await SeedAsync(Item("RS-1", "Running Shoe Blue", 60m), Item("TG-1", "Trail Gaiters", 30m));

        var names = await NamesAsync(await TokenAsync(), Q("জুতা"));

        names.Should().Equal("Running Shoe Blue");
    }

    [Fact]
    public async Task Bengali_digits_find_the_written_number()
    {
        await SeedAsync(Item("PB-1", "Power Bank 20000mAh", 25m), Item("PB-2", "Power Bank 5000mAh", 12m));

        var names = await NamesAsync(await TokenAsync(), Q("২০০০"));

        names.Should().Equal("Power Bank 20000mAh");
    }

    [Fact]
    public async Task Naming_a_brand_finds_its_products_through_the_secondary_pass()
    {
        await Factory.WithDbAsync(async db =>
        {
            var brand = new Brand { Name = "Velmora", Slug = "velmora", IsActive = true, CreatedAt = DateTime.UtcNow };
            db.Brands.Add(brand);
            await db.SaveChangesAsync();
            db.Products.AddRange(
                Item("VL-1", "Aria Desk Lamp", 44m, brandId: brand.Id),
                Item("VL-2", "Lumen Desk Lamp", 22m, brandId: brand.Id),
                Item("OT-1", "Ordinary Desk Lamp", 18m));
            await db.SaveChangesAsync();
            return true;
        });

        var token = await TokenAsync();

        // Neither product name says the brand, yet naming the brand finds both of them.
        (await NamesAsync(token, Q("velmora"))).Should().Equal("Aria Desk Lamp", "Lumen Desk Lamp");
        // and it is the same shelf the brand filter shows.
        (await TotalAsync(token, "brand=velmora")).Should().Be(2);
    }

    [Fact]
    public async Task Naming_a_category_finds_its_products_through_the_secondary_pass()
    {
        var categoryId = await Factory.WithDbAsync(async db =>
        {
            var category = new Category { Name = "Watches", Slug = "watches", Path = "/watches/", Depth = 1, IsActive = true };
            var product = Item("CS-1", "Chrono Steel 42", 120m);
            // A product always carries exactly one primary category, so it is set while the row is new.
            product.Categories.Add(new ProductCategory { Category = category, IsPrimary = true });
            db.Categories.Add(category);
            db.Products.Add(product);
            await db.SaveChangesAsync();
            return category.Id;
        });

        var token = await TokenAsync();

        (await NamesAsync(token, Q("watches"))).Should().Equal("Chrono Steel 42");
        // The category filter itself keeps working on the same product.
        (await TotalAsync(token, "categoryId=" + categoryId)).Should().Be(1);
    }

    [Fact]
    public async Task Every_word_has_to_match_something()
    {
        await SeedAsync(
            Item("RS-1", "Running Shoe Blue", 60m),
            Item("TG-1", "Trail Gaiters", 30m, "Waterproof shoe cover"));

        var names = await NamesAsync(await TokenAsync(), Q("shoe blue"));

        names.Should().Equal("Running Shoe Blue");
    }

    [Fact]
    public async Task Paging_walks_the_relevance_order()
    {
        await SeedAsync(
            Item("ZB-1", "Zebra Shoe Brush", 40m, "Dusts brushes"),
            Item("SHOE-11", "Alpha Wall Hook", 10m, "Holds coats"),
            Item("BT-1", "Beta Towel", 20m, "Cotton shoe bag"));

        var token = await TokenAsync();

        (await NamesAsync(token, Q("shoe", "pageSize=2"))).Should().Equal("Zebra Shoe Brush", "Alpha Wall Hook");
        (await NamesAsync(token, Q("shoe", "pageSize=2", "page=2"))).Should().Equal("Beta Towel");
    }

    [Fact]
    public async Task Brand_facet_counts_agree_with_a_search()
    {
        await Factory.WithDbAsync(async db =>
        {
            var velmora = new Brand { Name = "Velmora", Slug = "velmora", IsActive = true, CreatedAt = DateTime.UtcNow };
            var corvid = new Brand { Name = "Corvid", Slug = "corvid", IsActive = true, CreatedAt = DateTime.UtcNow };
            db.Brands.AddRange(velmora, corvid);
            await db.SaveChangesAsync();
            db.Products.AddRange(
                Item("V-1", "Velmora Kettle 1L", 30m, brandId: velmora.Id),
                Item("V-2", "Velmora Kettle 2L", 45m, brandId: velmora.Id),
                Item("C-1", "Corvid Mug", 8m, brandId: corvid.Id));
            await db.SaveChangesAsync();
            return true;
        });

        var token = await TokenAsync();
        var brands = await ReadAsync<IReadOnlyList<BrandDto>>(await GetAsync($"api/brands?{Q("kettle")}", token));

        brands.Should().ContainSingle("only Velmora makes kettles");
        brands[0].ProductCount.Should().Be(await TotalAsync(token, Q("kettle")));

        // Searching a brand name counts the same products the shopper then sees.
        var byBrand = await ReadAsync<IReadOnlyList<BrandDto>>(await GetAsync($"api/brands?{Q("velmora")}", token));
        byBrand.Single().ProductCount.Should().Be(await TotalAsync(token, Q("velmora")));
    }
}
