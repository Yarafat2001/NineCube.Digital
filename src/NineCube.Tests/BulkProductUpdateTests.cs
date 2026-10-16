using System.Net;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// Bulk editing through POST /api/products/bulk. The two properties that matter are that one
/// request is one transaction with a per-item verdict, and that stock is never, ever touched here.
/// </summary>
public sealed class BulkProductUpdateTests(ApiFactory factory) : ApiTestBase(factory)
{
    private async Task<string> StaffTokenAsync() =>
        (await SeedAndLoginAsync($"bulk-staff-{Guid.NewGuid():N}@example.com", UserRole.Staff)).Token;

    private async Task<BulkProductResultDto> BulkAsync(string token, object body)
    {
        var response = await PostBulkAsync(token, body);
        return await ReadAsync<BulkProductResultDto>(response);
    }

    private async Task<HttpResponseMessage> PostBulkAsync(string token, object body)
    {
        var response = await PostAsync("api/products/bulk", body, token);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return response;
    }

    // ------------------------------------------------------------------ success

    [Fact]
    public async Task Set_category_moves_every_product_and_keeps_exactly_one_primary()
    {
        var token = await StaffTokenAsync();
        var a = await SeedProductAsync("B-01-A", 10m, stock: 3);
        var b = await SeedProductAsync("B-01-B", 20m, stock: 4);

        var result = await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "set-category", @params = new { categoryId = 2 } });

        result.Action.Should().Be("set-category");
        result.Requested.Should().Be(2);
        result.Updated.Should().Be(2);
        result.Items.Should().OnlyContain(i => i.Result == "updated");

        var primaries = await Factory.QueryAsync(db => db.ProductCategories
            .Where(pc => pc.ProductId == a.Id || pc.ProductId == b.Id)
            .GroupBy(pc => pc.ProductId)
            .Select(g => new { g.Key, Primaries = g.Count(x => x.IsPrimary), Total = g.Count() })
            .ToListAsync());

        primaries.Should().HaveCount(2);
        primaries.Should().OnlyContain(x => x.Primaries == 1, "the invariant 'exactly one primary category' survives a bulk move");

        // Every test product is seeded with a primary link to category 1, so a bulk move adds the
        // target link and demotes the old one. Secondary memberships are kept: this action changes
        // the primary, it does not remove the product from the categories it already belongs to.
        primaries.Should().OnlyContain(x => x.Total == 2, "the previous category stays as a secondary membership");

        // A second identical request changes nothing.
        var replay = await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "set-category", @params = new { categoryId = 2 } });
        replay.Updated.Should().Be(0);
        replay.Skipped.Should().Be(2);
        replay.Items.Should().OnlyContain(i => i.Reason == "Already in this category.");
    }

    [Fact]
    public async Task Activate_and_deactivate_report_changed_rows_and_repeat_as_skipped()
    {
        var token = await StaffTokenAsync();
        var on = await SeedProductAsync("B-02-ON", 10m, stock: 1);
        var off = await SeedProductAsync("B-02-OFF", 10m, stock: 1, isActive: false);

        var result = await BulkAsync(token, new { ids = new[] { on.Id, off.Id }, action = "deactivate" });
        result.Updated.Should().Be(1, "only the active product needed to move");
        result.Skipped.Should().Be(1);
        result.Items.Single(i => i.Id == off.Id).Reason.Should().Be("Already inactive.");

        (await Factory.QueryAsync(db => db.Products.Where(p => p.Id == on.Id).Select(p => p.IsActive).FirstAsync()))
            .Should().BeFalse();
    }

    [Fact]
    public async Task Tags_are_added_to_every_selection_and_removed_again()
    {
        var token = await StaffTokenAsync();
        var a = await SeedProductAsync("B-03-A", 10m, stock: 1);
        var b = await SeedProductAsync("B-03-B", 10m, stock: 1);

        var added = await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "add-tags", @params = new { tags = new[] { "clearance", "bundle" } } });
        added.Updated.Should().Be(2);

        var withTags = await Factory.QueryAsync(db => db.Products
            .Where(p => p.Id == a.Id || p.Id == b.Id)
            .Select(p => new { p.Id, Tags = p.Tags.Select(t => t.Tag.Name).OrderBy(n => n).ToList() })
            .ToListAsync());

        withTags.Should().HaveCount(2);
        withTags.Should().OnlyContain(x => x.Tags.SequenceEqual(new[] { "bundle", "clearance" }));

        // Repeating the add is a no-op, and the removal reverses it for both products.
        var repeat = await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "add-tags", @params = new { tags = new[] { "clearance", "bundle" } } });
        repeat.Updated.Should().Be(0);
        repeat.Skipped.Should().Be(2);

        var removed = await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "remove-tags", @params = new { tags = new[] { "clearance" } } });
        removed.Updated.Should().Be(2);

        (await Factory.QueryAsync(db => db.ProductTags.CountAsync(pt => pt.ProductId == a.Id))).Should().Be(1);
    }

    [Fact]
    public async Task Assign_brand_moves_the_series_with_the_brand()
    {
        var token = await StaffTokenAsync();
        var a = await SeedProductAsync("B-04-A", 10m, stock: 1);
        var b = await SeedProductAsync("B-04-B", 10m, stock: 1);

        var ids = await Factory.WithDbAsync(async db =>
        {
            var brand = new Brand { Name = "Walton", Slug = "walton", CreatedAt = DateTime.UtcNow };
            db.Brands.Add(brand);
            await db.SaveChangesAsync();
            var line = new ProductLine { BrandId = brand.Id, Name = "NexG", Slug = "nexg", SortOrder = 1 };
            db.ProductLines.Add(line);
            await db.SaveChangesAsync();
            return (brand.Id, line.Id);
        });

        var result = await BulkAsync(token, new
        {
            ids = new[] { a.Id, b.Id },
            action = "assign-brand",
            @params = new { brandId = ids.Item1, productLineId = ids.Item2 }
        });

        result.Updated.Should().Be(2);

        var assigned = await Factory.QueryAsync(db => db.Products
            .Where(p => p.Id == a.Id || p.Id == b.Id)
            .Select(p => new { p.BrandId, p.ProductLineId })
            .ToListAsync());

        assigned.Should().HaveCount(2);
        assigned.Should().OnlyContain(x => x.BrandId == ids.Item1 && x.ProductLineId == ids.Item2,
            "a series always carries its brand");
    }

    // ------------------------------------------------------------------ partial failure

    [Fact]
    public async Task An_unknown_id_fails_on_its_own_while_the_rest_of_the_batch_completes()
    {
        var token = await StaffTokenAsync();
        var known = await SeedProductAsync("B-05-A", 10m, stock: 2);

        var response = await PostAsync("api/products/bulk",
            new { ids = new[] { known.Id, 999_999 }, action = "deactivate" }, token);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await ReadAsync<BulkProductResultDto>(response);
        result.Requested.Should().Be(2);
        result.Updated.Should().Be(1);
        result.Failed.Should().Be(1);
        result.Items.Single(i => i.Id == 999_999).Result.Should().Be("failed");
        result.Items.Single(i => i.Id == 999_999).Reason.Should().Be("Product not found.");

        (await Factory.QueryAsync(db => db.Products.Where(p => p.Id == known.Id).Select(p => p.IsActive).FirstAsync()))
            .Should().BeFalse("the valid id is still committed even though its sibling failed");
    }

    [Fact]
    public async Task A_product_over_the_tag_limit_fails_without_blocking_the_batch()
    {
        var token = await StaffTokenAsync();
        var full = await Factory.WithDbAsync(async db =>
        {
            var product = new Product
            {
                Sku = "B-06-FULL",
                Name = "Already tagged",
                Price = 10m,
                StockQuantity = 1,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Products.Add(product);

            // Materialised: a lazy projection would hand AddRange and the loop two different sets.
            var tags = Enumerable.Range(1, 20).Select(i => new Tag { Name = $"t{i:00}" }).ToList();
            db.Tags.AddRange(tags);
            await db.SaveChangesAsync();

            foreach (var tag in tags) db.ProductTags.Add(new ProductTag { ProductId = product.Id, TagId = tag.Id });
            await db.SaveChangesAsync();
            return product;
        });

        var roomy = await SeedProductAsync("B-06-OK", 10m, stock: 1);

        var result = await BulkAsync(token, new
        {
            ids = new[] { full.Id, roomy.Id },
            action = "add-tags",
            @params = new { tags = new[] { "t01", "extra" } }
        });

        result.Failed.Should().Be(1);
        result.Updated.Should().Be(1);
        result.Items.Single(i => i.Id == full.Id).Reason.Should().Contain("at most 20");
    }

    // ------------------------------------------------------------------ request validation

    [Fact]
    public async Task More_than_200_ids_is_rejected_before_anything_is_written()
    {
        var token = await StaffTokenAsync();
        var product = await SeedProductAsync("B-07-A", 10m, stock: 5);

        var ids = Enumerable.Range(900_000, 201).ToArray();

        var response = await PostAsync("api/products/bulk", new { ids, action = "deactivate" }, token);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await ReadJsonAsync(response);
        problem.GetProperty("code").GetString().Should().Be("invalid_request");
        problem.GetProperty("errors").GetProperty("ids")[0].GetString().Should().Contain("at most 200");

        (await Factory.QueryAsync(db => db.Products.Where(p => p.Id == product.Id).Select(p => p.IsActive).FirstAsync()))
            .Should().BeTrue();
    }

    [Theory]
    [InlineData("empty-ids")]
    [InlineData("unknown-action")]
    [InlineData("missing-category")]
    [InlineData("missing-tags")]
    [InlineData("zero-id")]
    public async Task Invalid_requests_are_RFC_7807_bad_requests(string scenario)
    {
        var token = await StaffTokenAsync();
        var product = await SeedProductAsync($"B-08-{scenario}", 10m, stock: 5);

        object body = scenario switch
        {
            "empty-ids" => new { ids = Array.Empty<int>(), action = "deactivate" },
            "unknown-action" => new { ids = new[] { product.Id }, action = "set-stock" },
            "missing-category" => new { ids = new[] { product.Id }, action = "set-category" },
            "missing-tags" => new { ids = new[] { product.Id }, action = "add-tags" },
            _ => new { ids = new[] { 0 }, action = "deactivate" }
        };

        var response = await PostAsync("api/products/bulk", body, token);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest, await response.Content.ReadAsStringAsync());
        (await ReadJsonAsync(response)).GetProperty("code").GetString().Should().Be("invalid_request");
    }

    [Fact]
    public async Task Set_category_with_an_unknown_category_is_a_404()
    {
        var token = await StaffTokenAsync();
        var product = await SeedProductAsync("B-09-A", 10m, stock: 5);

        var response = await PostAsync("api/products/bulk",
            new { ids = new[] { product.Id }, action = "set-category", @params = new { categoryId = 424_242 } }, token);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Assign_brand_with_a_series_from_another_brand_is_rejected()
    {
        var token = await StaffTokenAsync();
        var ids = await Factory.WithDbAsync(async db =>
        {
            var apple = new Brand { Name = "Apple", Slug = "apple", CreatedAt = DateTime.UtcNow };
            var samsung = new Brand { Name = "Samsung", Slug = "samsung", CreatedAt = DateTime.UtcNow };
            db.Brands.AddRange(apple, samsung);
            await db.SaveChangesAsync();
            var galaxy = new ProductLine { BrandId = samsung.Id, Name = "Galaxy", Slug = "galaxy" };
            db.ProductLines.Add(galaxy);
            await db.SaveChangesAsync();
            return (apple.Id, galaxy.Id);
        });

        var product = await SeedProductAsync("B-10-A", 10m, stock: 5);

        var response = await PostAsync("api/products/bulk", new
        {
            ids = new[] { product.Id },
            action = "assign-brand",
            @params = new { brandId = ids.Item1, productLineId = ids.Item2 }
        }, token);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ReadJsonAsync(response)).GetProperty("code").GetString().Should().Be("brand_line_mismatch");
    }

    // ------------------------------------------------------------------ authorization + stock

    [Fact]
    public async Task A_customer_cannot_bulk_edit_the_catalogue()
    {
        var customer = await RegisterCustomerAsync("b-11@example.com");
        var product = await SeedProductAsync("B-11-A", 10m, stock: 5);

        var response = await PostAsync("api/products/bulk",
            new { ids = new[] { product.Id }, action = "deactivate" }, customer.AccessToken);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await Factory.QueryAsync(db => db.Products.Where(p => p.Id == product.Id).Select(p => p.IsActive).FirstAsync()))
            .Should().BeTrue();
    }

    [Fact]
    public async Task Bulk_edits_never_touch_stock_even_when_an_order_is_the_reason()
    {
        var token = await StaffTokenAsync();
        var a = await SeedProductAsync("B-12-A", 10m, stock: 7);
        var b = await SeedProductAsync("B-12-B", 10m, stock: 8);

        var before = await Factory.QueryAsync(db => db.Products
            .Where(p => p.Id == a.Id || p.Id == b.Id)
            .OrderBy(p => p.Id)
            .Select(p => p.StockQuantity)
            .ToListAsync());

        await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "set-category", @params = new { categoryId = 2 } });
        await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "deactivate" });
        await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "add-tags", @params = new { tags = new[] { "bulk" } } });
        await BulkAsync(token, new { ids = new[] { a.Id, b.Id }, action = "activate" });

        var after = await Factory.QueryAsync(db => db.Products
            .Where(p => p.Id == a.Id || p.Id == b.Id)
            .OrderBy(p => p.Id)
            .Select(p => p.StockQuantity)
            .ToListAsync());

        after.Should().Equal(before);
        (await Factory.CountInventoryMovementsAsync(a.Id)).Should().Be(0, "bulk edits are not stock movements");
    }
}
