using System.Net;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// Assessment tests 1-6: order placement, stock reservation, the all-or-nothing guarantee,
/// duplicate-line merging and idempotency. All of these run against a real SQL Server.
/// </summary>
public sealed class OrderPlacementTests : ApiTestBase
{
    public OrderPlacementTests(ApiFactory factory) : base(factory) { }

    // ------------------------------------------------------------------ 1

    [Fact]
    public async Task Test01_Valid_order_returns_201_decrements_stock_and_computes_the_total()
    {
        var product = await SeedProductAsync("T01-A", 10.50m, stock: 10);
        var customer = await RegisterCustomerAsync("t01@example.com");

        var response = await PlaceOrderAsync(customer.AccessToken, [(product.Id, 3)], idempotencyKey: Guid.NewGuid().ToString());

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var order = await ReadAsync<OrderDto>(response);
        order.Status.Should().Be(OrderStatus.Pending);
        order.CustomerId.Should().Be(customer.User.CustomerId);
        order.TotalAmount.Should().Be(31.50m);
        order.Items.Should().HaveCount(1);
        order.Items[0].Quantity.Should().Be(3);
        order.Items[0].UnitPrice.Should().Be(10.50m);
        order.Items[0].LineTotal.Should().Be(31.50m);
        order.Items[0].ProductId.Should().Be(product.Id);

        (await Factory.GetStockAsync(product.Id)).Should().Be(7, "3 units were reserved at placement");
        (await Factory.CountOrdersAsync()).Should().Be(1);
    }

    // ------------------------------------------------------------------ 2

    [Fact]
    public async Task Test02_Quantity_above_stock_returns_409_leaves_stock_untouched_and_saves_no_order()
    {
        var product = await SeedProductAsync("T02-A", 12.00m, stock: 2);
        var customer = await RegisterCustomerAsync("t02@example.com");

        var response = await PlaceOrderAsync(customer.AccessToken, [(product.Id, 5)], idempotencyKey: Guid.NewGuid().ToString());

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var problem = await ReadJsonAsync(response);
        problem.GetProperty("code").GetString().Should().Be("insufficient_stock");
        problem.GetProperty("correlationId").GetString().Should().NotBeNullOrWhiteSpace();

        var shortItem = problem.GetProperty("shortItems")[0];
        shortItem.GetProperty("productId").GetInt32().Should().Be(product.Id);
        shortItem.GetProperty("requested").GetInt32().Should().Be(5);
        shortItem.GetProperty("available").GetInt32().Should().Be(2);

        (await Factory.GetStockAsync(product.Id)).Should().Be(2, "a rejected order must not consume stock");
        (await Factory.CountOrdersAsync()).Should().Be(0, "a rejected order must not be persisted");
        (await Factory.CountInventoryMovementsAsync(product.Id)).Should().Be(0);
    }

    // ------------------------------------------------------------------ 3

    [Theory]
    [InlineData("unknown-product")]
    [InlineData("zero-quantity")]
    [InlineData("negative-quantity")]
    [InlineData("empty-items")]
    [InlineData("quantity-above-cap")]
    public async Task Test03_Invalid_requests_are_rejected_with_4xx_and_change_nothing(string scenario)
    {
        var product = await SeedProductAsync("T03-A", 5.00m, stock: 50);
        var customer = await RegisterCustomerAsync("t03@example.com");

        var lines = scenario switch
        {
            "unknown-product" => new List<(int, int)> { (2_000_000, 1) },
            "zero-quantity" => new List<(int, int)> { (product.Id, 0) },
            "negative-quantity" => new List<(int, int)> { (product.Id, -5) },
            "empty-items" => new List<(int, int)>(),
            "quantity-above-cap" => new List<(int, int)> { (product.Id, 1001) },
            _ => throw new ArgumentOutOfRangeException(nameof(scenario))
        };

        var response = await PlaceOrderAsync(customer.AccessToken, lines, idempotencyKey: Guid.NewGuid().ToString());

        ((int)response.StatusCode).Should().BeInRange(400, 499, $"{scenario} must be a client error");

        var problem = await ReadJsonAsync(response);
        problem.TryGetProperty("code", out var code).Should().BeTrue("the error contract always carries a code");
        code.GetString().Should().NotBeNullOrWhiteSpace();
        problem.GetProperty("correlationId").GetString().Should().NotBeNullOrWhiteSpace();

        (await Factory.CountOrdersAsync()).Should().Be(0);
        (await Factory.GetStockAsync(product.Id)).Should().Be(50);
    }

    // ------------------------------------------------------------------ 4

    [Fact]
    public async Task Test04_Multi_item_order_with_one_unavailable_item_rolls_back_every_line()
    {
        // Ids are assigned in creation order, so the available item is updated first and the
        // failing item second. The whole transaction must still be rolled back.
        var available = await SeedProductAsync("T04-A", 8.00m, stock: 10);
        var scarce = await SeedProductAsync("T04-B", 3.00m, stock: 1);

        available.Id.Should().BeLessThan(scarce.Id);

        var customer = await RegisterCustomerAsync("t04@example.com");

        var response = await PlaceOrderAsync(
            customer.AccessToken,
            [(available.Id, 5), (scarce.Id, 5)],
            idempotencyKey: Guid.NewGuid().ToString());

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await Factory.GetStockAsync(available.Id))
            .Should().Be(10, "the successful line must be rolled back with the failing one");
        (await Factory.GetStockAsync(scarce.Id)).Should().Be(1);
        (await Factory.CountOrdersAsync()).Should().Be(0);
        (await Factory.CountInventoryMovementsAsync(available.Id)).Should().Be(0);
    }

    // ------------------------------------------------------------------ 5

    [Fact]
    public async Task Test05_Duplicate_lines_are_merged()
    {
        var product = await SeedProductAsync("T05-A", 4.00m, stock: 20);
        var customer = await RegisterCustomerAsync("t05@example.com");

        var response = await PlaceOrderAsync(
            customer.AccessToken,
            [(product.Id, 2), (product.Id, 3)],
            idempotencyKey: Guid.NewGuid().ToString());

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var order = await ReadAsync<OrderDto>(response);
        order.Items.Should().HaveCount(1, "two lines for the same product must be merged");
        order.Items[0].Quantity.Should().Be(5);
        order.TotalAmount.Should().Be(20.00m);

        (await Factory.GetStockAsync(product.Id)).Should().Be(15);
    }

    // ------------------------------------------------------------------ 6

    [Fact]
    public async Task Test06_Repeating_the_idempotency_key_returns_the_same_order_and_reserves_stock_once()
    {
        var product = await SeedProductAsync("T06-A", 7.25m, stock: 10);
        var customer = await RegisterCustomerAsync("t06@example.com");
        var key = Guid.NewGuid().ToString();

        var first = await PlaceOrderAsync(customer.AccessToken, [(product.Id, 4)], key);
        first.StatusCode.Should().Be(HttpStatusCode.Created);
        var original = await ReadAsync<OrderDto>(first);

        var second = await PlaceOrderAsync(customer.AccessToken, [(product.Id, 4)], key);
        second.StatusCode.Should().Be(HttpStatusCode.OK, "a replay is not a new creation");

        var replay = await ReadAsync<OrderDto>(second);
        replay.Id.Should().Be(original.Id);

        (await Factory.CountOrdersAsync()).Should().Be(1);
        (await Factory.GetStockAsync(product.Id)).Should().Be(6, "stock is reserved exactly once");
    }

    [Fact]
    public async Task Test06b_Different_customers_may_reuse_the_same_idempotency_key()
    {
        var product = await SeedProductAsync("T06-B", 7.25m, stock: 10);
        var first = await RegisterCustomerAsync("t06b-1@example.com");
        var second = await RegisterCustomerAsync("t06b-2@example.com");
        var key = "shared-key-value";

        var a = await PlaceOrderAsync(first.AccessToken, [(product.Id, 1)], key);
        var b = await PlaceOrderAsync(second.AccessToken, [(product.Id, 1)], key);

        a.StatusCode.Should().Be(HttpStatusCode.Created);
        b.StatusCode.Should().Be(HttpStatusCode.Created, "the key is unique per customer, not globally");

        (await Factory.CountOrdersAsync()).Should().Be(2);
        (await Factory.GetStockAsync(product.Id)).Should().Be(8);
    }

    [Fact]
    public async Task Test06c_Timestamps_are_published_as_unambiguous_utc_instants()
    {
        var product = await SeedProductAsync("T06-C", 5.00m, stock: 3);
        var customer = await RegisterCustomerAsync("t06c@example.com");

        var response = await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)], idempotencyKey: Guid.NewGuid().ToString());
        var json = await ReadJsonAsync(response);

        // Without the trailing "Z" a browser reads the value as *local* time, which silently
        // shifted every timestamp by the viewer's UTC offset (Asia/Dhaka saw the previous day).
        var createdAt = json.GetProperty("createdAt").GetString()!;
        createdAt.Should().EndWith("Z", "an offset-less value would be re-labelled as local time");
        DateTime.Parse(createdAt, null, System.Globalization.DateTimeStyles.RoundtripKind)
            .Kind.Should().Be(DateTimeKind.Utc);

        var updatedAt = json.GetProperty("updatedAt").GetString()!;
        updatedAt.Should().EndWith("Z");
    }
}
