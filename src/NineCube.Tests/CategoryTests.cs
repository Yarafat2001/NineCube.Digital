using System.Net;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

public sealed class CategoryTests(ApiFactory factory) : ApiTestBase(factory)
{
    private async Task<CategoryDto> Create(string token, string name, string slug, int? parent = null)
    {
        var response = await PostAsync("api/categories", new CategoryRequest(name, slug, parent), token);
        response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return await ReadAsync<CategoryDto>(response);
    }
    private Task<HttpResponseMessage> Set(string token, int product, int[] categories, int? primary = null, string[]? tags = null) =>
        Client.SendAsync(Request(HttpMethod.Put, $"api/products/{product}/categories", new ProductCategoriesRequest(categories, primary, tags), token));
    private static IEnumerable<CategoryDto> Flatten(IEnumerable<CategoryDto> nodes) => nodes.SelectMany(n => new[] { n }.Concat(Flatten(n.Children)));

    [Fact]
    public async Task Subtree_filters_deduplicate_multi_category_products_and_counts_match()
    {
        var (_, token) = await SeedAndLoginAsync("categories@example.com", UserRole.Staff);
        var root = await Create(token, "Test Root", "test-root");
        var child = await Create(token, "Test Child", "test-child", root.Id);
        var direct = await SeedProductAsync("DIRECT", 10m, 5);
        var nested = await SeedProductAsync("NESTED", 20m, 0);
        (await Set(token, direct.Id, [root.Id, child.Id], root.Id, ["featured"])).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Set(token, nested.Id, [child.Id], child.Id)).StatusCode.Should().Be(HttpStatusCode.OK);
        var subtree = await ReadAsync<PagedResult<ProductDto>>(await GetAsync($"api/products?categoryId={root.Id}", token));
        subtree.TotalCount.Should().Be(2); subtree.Items.Select(p => p.Id).Should().OnlyHaveUniqueItems();
        var onlyDirect = await ReadAsync<PagedResult<ProductDto>>(await GetAsync($"api/products?categorySlug=test-root&includeDescendants=false", token));
        onlyDirect.Items.Should().ContainSingle(p => p.Id == direct.Id);
        var childPage = await ReadAsync<PagedResult<ProductDto>>(await GetAsync($"api/products?categoryId={child.Id}", token));
        childPage.TotalCount.Should().Be(2);
        var tree = await ReadAsync<List<CategoryDto>>(await GetAsync("api/categories", token));
        var count = Flatten(tree).Single(c => c.Id == root.Id);
        count.ProductCount.Should().Be(2); count.InStockCount.Should().Be(1); count.DirectProductCount.Should().Be(1);
        var filtered = await ReadAsync<PagedResult<ProductDto>>(await GetAsync("api/products?tag=featured&inStock=true&minPrice=5&maxPrice=15&sort=price", token));
        filtered.Items.Should().ContainSingle(p => p.Id == direct.Id);
    }

    [Fact]
    public async Task Cycles_depth_and_duplicate_sibling_names_are_rejected()
    {
        var (_, token) = await SeedAndLoginAsync("category-rules@example.com", UserRole.Staff);
        var root = await Create(token, "Root", "rules-root");
        var second = await Create(token, "Child", "rules-child", root.Id);
        var third = await Create(token, "Third", "rules-third", second.Id);
        var fourth = await Create(token, "Fourth", "rules-fourth", third.Id);
        (await PostAsync($"api/categories/{root.Id}/move", new MoveCategoryRequest(third.Id), token)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await PostAsync($"api/categories/{root.Id}/move", new MoveCategoryRequest(root.Id), token)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await PostAsync("api/categories", new CategoryRequest("Fifth", "rules-fifth", fourth.Id), token)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await PostAsync("api/categories", new CategoryRequest("Child", "another-child", root.Id), token)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await PostAsync("api/categories", new CategoryRequest("Different", root.Slug), token)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Rename_and_move_recompute_the_subtree_without_changing_stock()
    {
        var (_, token) = await SeedAndLoginAsync("category-paths@example.com", UserRole.Staff);
        var a = await Create(token, "A", "path-a"); var b = await Create(token, "B", "path-b", a.Id);
        var c = await Create(token, "C", "path-c", b.Id); var target = await Create(token, "Target", "path-target");
        var product = await SeedProductAsync("PATH-STOCK", 13m, 8);
        await Set(token, product.Id, [c.Id], c.Id);
        (await Client.SendAsync(Request(HttpMethod.Put, $"api/categories/{b.Id}", new CategoryRequest("Renamed", "renamed", a.Id), token))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await PostAsync($"api/categories/{b.Id}/move", new MoveCategoryRequest(target.Id), token)).StatusCode.Should().Be(HttpStatusCode.OK);
        var changed = await ReadAsync<CategoryDto>(await GetAsync($"api/categories/{c.Id}", token));
        changed.Path.Should().Be("/path-target/renamed/path-c/"); changed.Depth.Should().Be(3);
        changed.Breadcrumb.Select(x => x.Name).Should().Equal("Target", "Renamed", "C");
        var loaded = await ReadAsync<ProductDto>(await GetAsync($"api/products/{product.Id}", token));
        loaded.StockQuantity.Should().Be(8); loaded.Price.Should().Be(13m);
    }

    [Fact]
    public async Task Delete_requires_reassignment_and_reparents_children_atomically()
    {
        var (_, token) = await SeedAndLoginAsync("category-delete@example.com", UserRole.Staff);
        var source = await Create(token, "Source", "delete-source"); var child = await Create(token, "Child", "delete-child", source.Id);
        var target = await Create(token, "Target", "delete-target"); var product = await SeedProductAsync("DELETE-STOCK", 13m, 7);
        await Set(token, product.Id, [source.Id], source.Id);
        (await Client.SendAsync(Request(HttpMethod.Delete, $"api/categories/{source.Id}", null, token))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await Client.SendAsync(Request(HttpMethod.Delete, $"api/categories/{source.Id}?reassignToCategoryId={child.Id}", null, token))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await Client.SendAsync(Request(HttpMethod.Delete, $"api/categories/{source.Id}?reassignToCategoryId={target.Id}", null, token))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var loaded = await ReadAsync<ProductDto>(await GetAsync($"api/products/{product.Id}", token));
        loaded.Categories.Should().ContainSingle(c => c.Id == target.Id && c.IsPrimary); loaded.StockQuantity.Should().Be(7);
        var moved = await ReadAsync<CategoryDto>(await GetAsync($"api/categories/{child.Id}", token));
        moved.ParentId.Should().Be(target.Id); moved.Path.Should().Be("/delete-target/delete-child/");
        (await Client.SendAsync(Request(HttpMethod.Delete, "api/categories/1", null, token))).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Uncategorized_stays_active_at_the_root_under_its_original_name()
    {
        var (_, token) = await SeedAndLoginAsync("category-protected@example.com", UserRole.Staff);
        var other = await Create(token, "Other", "protected-other");
        (await Client.SendAsync(Request(HttpMethod.Put, "api/categories/1", new CategoryRequest("Renamed fallback", "uncategorized"), token))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await Client.SendAsync(Request(HttpMethod.Put, "api/categories/1", new CategoryRequest("Uncategorized", "uncategorized", other.Id), token))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await Client.SendAsync(Request(HttpMethod.Put, "api/categories/1", new CategoryRequest("Uncategorized", "uncategorized", null, 0, false), token))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await PostAsync("api/categories/1/move", new MoveCategoryRequest(other.Id), token)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        var untouched = await ReadAsync<CategoryDto>(await GetAsync("api/categories/1", token));
        untouched.Name.Should().Be("Uncategorized"); untouched.Slug.Should().Be("uncategorized");
        untouched.ParentId.Should().BeNull(); untouched.IsActive.Should().BeTrue();
        var reordered = await Client.SendAsync(Request(HttpMethod.Put, "api/categories/1", new CategoryRequest("Uncategorized", "uncategorized", null, 7), token));
        reordered.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<CategoryDto>(await GetAsync("api/categories/1", token))).SortOrder.Should().Be(7);
    }

    [Fact]
    public async Task Empty_assignment_falls_back_and_the_database_rejects_a_second_primary()
    {
        var (_, token) = await SeedAndLoginAsync("category-primary@example.com", UserRole.Staff);
        var category = await Create(token, "Choice", "primary-choice"); var product = await SeedProductAsync("PRIMARY", 1m, 5);
        await Set(token, product.Id, [1, category.Id], category.Id);
        var loaded = await ReadAsync<ProductDto>(await GetAsync($"api/products/{product.Id}", token));
        loaded.Categories!.Count(c => c.IsPrimary).Should().Be(1);
        await Set(token, product.Id, [], null);
        loaded = await ReadAsync<ProductDto>(await GetAsync($"api/products/{product.Id}", token));
        loaded.Categories.Should().ContainSingle(c => c.Id == 1 && c.IsPrimary);
        Func<Task> illegal = () => Factory.WithDbAsync(async db => {
            db.ProductCategories.Add(new ProductCategory { ProductId = product.Id, CategoryId = category.Id, IsPrimary = true });
            return await db.SaveChangesAsync();
        });
        await illegal.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task Inactive_parent_hides_subtree_but_ordering_and_snapshots_still_work()
    {
        var (_, staff) = await SeedAndLoginAsync("category-hidden@example.com", UserRole.Staff);
        var root = await Create(staff, "Hidden Root", "hidden-root"); var child = await Create(staff, "Original Category", "hidden-child", root.Id);
        var product = await SeedProductAsync("HIDDEN-ORDER", 10m, 3);
        await Set(staff, product.Id, [child.Id], child.Id);
        await Client.SendAsync(Request(HttpMethod.Put, $"api/categories/{root.Id}", new CategoryRequest(root.Name, root.Slug, null, 0, false), staff));
        var tree = await ReadAsync<List<CategoryDto>>(await GetAsync("api/categories", staff));
        Flatten(tree).Should().NotContain(c => c.Id == root.Id || c.Id == child.Id);
        (await GetAsync($"api/products?categoryId={child.Id}", staff)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        var (_, customer) = await SeedAndLoginAsync("category-customer@example.com", UserRole.Customer);
        var response = await PostAsync("api/orders", new CreateOrderRequest([new OrderLineRequest(product.Id, 1)]), customer);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var order = await ReadAsync<OrderDto>(response);
        await Client.SendAsync(Request(HttpMethod.Put, $"api/categories/{child.Id}", new CategoryRequest("New Category", "new-hidden-child", root.Id), staff));
        await Factory.WithDbAsync(async db => { var p = await db.Products.SingleAsync(p => p.Id == product.Id); p.Name = "Renamed Product"; return await db.SaveChangesAsync(); });
        var snapshot = await ReadAsync<OrderDto>(await GetAsync($"api/orders/{order.Id}", customer));
        snapshot.Items[0].Name.Should().Be(product.Name); snapshot.Items[0].PrimaryCategoryName.Should().Be("Original Category");
        (await ReadAsync<ProductDto>(await GetAsync($"api/products/{product.Id}", staff))).StockQuantity.Should().Be(2);
    }

    [Fact]
    public async Task Concurrent_assignments_keep_one_primary_and_never_update_stock()
    {
        var (_, token) = await SeedAndLoginAsync("category-concurrent@example.com", UserRole.Staff);
        var a = await Create(token, "A", "concurrent-a"); var b = await Create(token, "B", "concurrent-b");
        var product = await SeedProductAsync("CONCURRENT-CATEGORY", 9m, 6);
        var responses = await Task.WhenAll(Set(token, product.Id, [a.Id], a.Id, ["A"]), Set(token, product.Id, [b.Id], b.Id, ["B"]));
        responses.Should().OnlyContain(r => r.StatusCode == HttpStatusCode.OK);
        var loaded = await ReadAsync<ProductDto>(await GetAsync($"api/products/{product.Id}", token));
        loaded.Categories.Should().ContainSingle(c => c.IsPrimary);
        loaded.Tags.Should().Equal(loaded.Categories![0].Id == a.Id ? "A" : "B");
        loaded.StockQuantity.Should().Be(6);
    }

    [Fact]
    public async Task Failed_reassignment_rolls_back_products_children_and_paths()
    {
        var (_, token) = await SeedAndLoginAsync("category-rollback@example.com", UserRole.Staff);
        var source = await Create(token, "Source", "rollback-source"); var target = await Create(token, "Target", "rollback-target");
        var child = await Create(token, "Same child", "rollback-child", source.Id);
        await Create(token, "Same child", "target-child", target.Id);
        var product = await SeedProductAsync("ROLLBACK-STOCK", 9m, 6); await Set(token, product.Id, [source.Id], source.Id);
        var response = await Client.SendAsync(Request(HttpMethod.Delete, $"api/categories/{source.Id}?reassignToCategoryId={target.Id}", null, token));
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var loaded = await ReadAsync<ProductDto>(await GetAsync($"api/products/{product.Id}", token));
        loaded.Categories.Should().ContainSingle(c => c.Id == source.Id && c.IsPrimary); loaded.StockQuantity.Should().Be(6);
        var unchanged = await ReadAsync<CategoryDto>(await GetAsync($"api/categories/{child.Id}", token));
        unchanged.ParentId.Should().Be(source.Id); unchanged.Path.Should().Be("/rollback-source/rollback-child/");
    }

    [Fact]
    public async Task Empty_category_is_a_success_and_unknown_category_is_not_found()
    {
        var (_, token) = await SeedAndLoginAsync("category-empty@example.com", UserRole.Staff);
        var c = await Create(token, "Empty", "empty-category");
        var response = await GetAsync($"api/products?categoryId={c.Id}", token);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<PagedResult<ProductDto>>(response)).Items.Should().BeEmpty();
        (await GetAsync("api/products?categorySlug=unknown-category", token)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
