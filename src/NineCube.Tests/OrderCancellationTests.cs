using System.Net;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// Assessment test 9. The interesting part is "exactly once": stock must come back when the order
/// is cancelled, but only from the request that actually won the conditional status update.
/// </summary>
public sealed class OrderCancellationTests : ApiTestBase
{
    public OrderCancellationTests(ApiFactory factory) : base(factory) { }

    [Fact]
    public async Task Test09_Cancel_restores_stock_and_releases_the_reservation()
    {
        var product = await SeedProductAsync("T09-A", 5.00m, stock: 10);
        var customer = await RegisterCustomerAsync("t09@example.com");

        var placed = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(customer.AccessToken, [(product.Id, 4)], Guid.NewGuid().ToString()));

        (await Factory.GetStockAsync(product.Id)).Should().Be(6);

        var cancel = await PostAsync($"api/orders/{placed.Id}/cancel", null, customer.AccessToken);
        cancel.StatusCode.Should().Be(HttpStatusCode.OK);

        var cancelled = await ReadAsync<OrderDto>(cancel);
        cancelled.Status.Should().Be(OrderStatus.Cancelled);

        (await Factory.GetStockAsync(product.Id)).Should().Be(10, "the reservation is released");

        // Ledger balances: the reservation and the release cancel each other out.
        (await Factory.SumMovementDeltaAsync(product.Id)).Should().Be(0);
        (await Factory.CountInventoryMovementsAsync(product.Id)).Should().Be(2);
    }

    [Fact]
    public async Task Test09_Cancelling_twice_restores_stock_only_once()
    {
        var product = await SeedProductAsync("T09-B", 5.00m, stock: 10);
        var customer = await RegisterCustomerAsync("t09b@example.com");

        var placed = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(customer.AccessToken, [(product.Id, 4)], Guid.NewGuid().ToString()));

        (await PostAsync($"api/orders/{placed.Id}/cancel", null, customer.AccessToken))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var second = await PostAsync($"api/orders/{placed.Id}/cancel", null, customer.AccessToken);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var problem = await ReadJsonAsync(second);
        problem.GetProperty("code").GetString().Should().Be("invalid_state_transition");
        problem.GetProperty("currentStatus").GetString().Should().Be("Cancelled");

        (await Factory.GetStockAsync(product.Id)).Should().Be(10, "stock must not be credited twice");
        (await Factory.CountInventoryMovementsAsync(product.Id)).Should().Be(2);
    }

    [Fact]
    public async Task Test09_Cancelling_concurrently_restores_stock_only_once()
    {
        var product = await SeedProductAsync("T09-C", 5.00m, stock: 10);
        var customer = await RegisterCustomerAsync("t09c@example.com");

        var placed = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(customer.AccessToken, [(product.Id, 3)], Guid.NewGuid().ToString()));

        (await Factory.GetStockAsync(product.Id)).Should().Be(7);

        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<HttpResponseMessage> Cancel()
        {
            await gate.Task;
            return await PostAsync($"api/orders/{placed.Id}/cancel", null, customer.AccessToken);
        }

        var first = Cancel();
        var second = Cancel();
        gate.SetResult();

        var responses = await Task.WhenAll(first, second);

        responses.Count(r => r.StatusCode == HttpStatusCode.OK).Should().Be(1);
        responses.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(1);

        (await Factory.GetStockAsync(product.Id)).Should().Be(10, "exactly one release wins");
        (await Factory.SumMovementDeltaAsync(product.Id)).Should().Be(0);
    }

    [Fact]
    public async Task Test09_Staff_can_cancel_a_confirmed_order()
    {
        var product = await SeedProductAsync("T09-D", 5.00m, stock: 10);
        var customer = await RegisterCustomerAsync("t09d@example.com");
        var (_, staffToken) = await SeedAndLoginAsync("t09d-staff@example.com", UserRole.Staff);

        var placed = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(customer.AccessToken, [(product.Id, 2)], Guid.NewGuid().ToString()));

        (await PostAsync($"api/orders/{placed.Id}/confirm", null, staffToken))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var cancel = await PostAsync($"api/orders/{placed.Id}/cancel", null, staffToken);
        cancel.StatusCode.Should().Be(HttpStatusCode.OK);

        (await Factory.GetStockAsync(product.Id)).Should().Be(10);
    }
}
