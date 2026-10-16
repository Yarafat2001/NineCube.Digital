using System.Net;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// Assessment test 12. Adjustments use the same atomic conditional update as order placement, so
/// "cannot go below zero" is enforced by the database rather than by a read-then-write check, and
/// every change leaves a ledger row naming the user and the reason.
/// </summary>
public sealed class StockAdjustmentTests : ApiTestBase
{
    public StockAdjustmentTests(ApiFactory factory) : base(factory) { }

    [Fact]
    public async Task Test12_Adjustment_writes_a_ledger_row_with_user_and_reason()
    {
        var product = await SeedProductAsync("T12-A", 10.00m, stock: 10);
        var (manager, token) = await SeedAndLoginAsync("t12-a@example.com", UserRole.InventoryManager);

        var response = await PostAsync($"api/products/{product.Id}/stock-adjustments",
            new { delta = -3, reason = "Damaged during delivery" }, token);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<ProductDto>(response)).StockQuantity.Should().Be(7);
        (await Factory.GetStockAsync(product.Id)).Should().Be(7);

        var movements = await ReadAsync<PagedResult<InventoryMovementDto>>(
            await GetAsync($"api/products/{product.Id}/movements", token));

        movements.Items.Should().HaveCount(1);
        movements.Items[0].Delta.Should().Be(-3);
        movements.Items[0].Reason.Should().Be("Damaged during delivery");
        movements.Items[0].CreatedByUserId.Should().Be(manager.Id);
        movements.Items[0].CreatedByEmail.Should().Be(manager.Email);
    }

    [Fact]
    public async Task Test12_Negative_adjustment_cannot_push_stock_below_zero()
    {
        var product = await SeedProductAsync("T12-B", 10.00m, stock: 2);
        var (_, token) = await SeedAndLoginAsync("t12-b@example.com", UserRole.InventoryManager);

        var response = await PostAsync($"api/products/{product.Id}/stock-adjustments",
            new { delta = -5, reason = "Shrinkage" }, token);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ReadJsonAsync(response)).GetProperty("code").GetString().Should().Be("stock_adjustment_conflict");

        (await Factory.GetStockAsync(product.Id)).Should().Be(2);
        (await Factory.CountInventoryMovementsAsync(product.Id)).Should().Be(0, "no ledger row for a rejected adjustment");
    }

    [Fact]
    public async Task Test12_Adjustment_requires_a_reason_and_a_non_zero_delta()
    {
        var product = await SeedProductAsync("T12-C", 10.00m, stock: 2);
        var (_, token) = await SeedAndLoginAsync("t12-c@example.com", UserRole.InventoryManager);

        var noReason = await PostAsync($"api/products/{product.Id}/stock-adjustments", new { delta = 1, reason = "" }, token);
        noReason.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJsonAsync(noReason)).GetProperty("code").GetString().Should().Be("invalid_request");

        var zeroDelta = await PostAsync($"api/products/{product.Id}/stock-adjustments", new { delta = 0, reason = "no-op" }, token);
        zeroDelta.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await Factory.GetStockAsync(product.Id)).Should().Be(2);
    }

    [Fact]
    public async Task Test12_Positive_adjustment_restocks_and_unknown_product_is_404()
    {
        var product = await SeedProductAsync("T12-D", 10.00m, stock: 0);
        var (_, token) = await SeedAndLoginAsync("t12-d@example.com", UserRole.InventoryManager);

        var restock = await PostAsync($"api/products/{product.Id}/stock-adjustments",
            new { delta = 25, reason = "Goods received note GRN-1042" }, token);

        restock.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<ProductDto>(restock)).StockQuantity.Should().Be(25);

        (await PostAsync("api/products/987654/stock-adjustments", new { delta = 1, reason = "ghost" }, token))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Test12_Concurrent_orders_cannot_be_overwritten_by_an_adjustment()
    {
        // A reservation landing at the same moment as an adjustment must both be accounted for,
        // never one silently replacing the other.
        var product = await SeedProductAsync("T12-E", 4.00m, stock: 10);
        var customer = await RegisterCustomerAsync("t12-e@example.com");
        var (_, token) = await SeedAndLoginAsync("t12-e-inv@example.com", UserRole.InventoryManager);

        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<HttpResponseMessage> Place()
        {
            await gate.Task;
            return await PlaceOrderAsync(customer.AccessToken, [(product.Id, 3)], Guid.NewGuid().ToString());
        }

        async Task<HttpResponseMessage> Adjust()
        {
            await gate.Task;
            return await PostAsync($"api/products/{product.Id}/stock-adjustments",
                new { delta = -2, reason = "Cycle count correction" }, token);
        }

        var orderTask = Place();
        var adjustTask = Adjust();
        gate.SetResult();

        var responses = await Task.WhenAll(orderTask, adjustTask);
        responses.Should().OnlyContain(r => r.StatusCode == HttpStatusCode.OK || r.StatusCode == HttpStatusCode.Created);

        (await Factory.GetStockAsync(product.Id)).Should().Be(5, "10 - 3 reserved - 2 adjusted");
        (await Factory.SumMovementDeltaAsync(product.Id)).Should().Be(-5);
    }

    [Fact]
    public async Task Test12_Inventory_manager_can_create_and_update_products()
    {
        var (_, token) = await SeedAndLoginAsync("t12-f@example.com", UserRole.InventoryManager);

        var create = await PostAsync("api/products",
            new { sku = "T12-F-1", name = "New product", price = 19.99m, isActive = true }, token);

        create.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await ReadAsync<ProductDto>(create);
        created.StockQuantity.Should().Be(0, "stock is only ever moved through an audited adjustment");

        var duplicate = await PostAsync("api/products",
            new { sku = "T12-F-1", name = "Duplicate", price = 1m, isActive = true }, token);
        duplicate.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ReadJsonAsync(duplicate)).GetProperty("code").GetString().Should().Be("duplicate_sku");

        var update = await PutAsync($"api/products/{created.Id}",
            new { name = "Renamed product", price = 24.50m, isActive = false }, token);

        update.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadAsync<ProductDto>(update);
        updated.Name.Should().Be("Renamed product");
        updated.Price.Should().Be(24.50m);
        updated.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task Test12_Inactive_products_cannot_be_ordered()
    {
        var product = await SeedProductAsync("T12-G", 10.00m, stock: 10, isActive: false);
        var customer = await RegisterCustomerAsync("t12-g@example.com");

        var response = await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)], Guid.NewGuid().ToString());

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var problem = await ReadJsonAsync(response);
        problem.GetProperty("code").GetString().Should().Be("insufficient_stock");
        problem.GetProperty("shortItems")[0].GetProperty("available").GetInt32().Should().Be(0);

        (await Factory.GetStockAsync(product.Id)).Should().Be(10);
        (await Factory.CountOrdersAsync()).Should().Be(0);
    }
}
