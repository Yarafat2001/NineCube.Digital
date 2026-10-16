using System.Net;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// Assessment test 11. Every transition is a conditional UPDATE, so an illegal transition is
/// reported as 409 with the current and attempted status - never silently applied and never a 500.
/// </summary>
public sealed class OrderStatusTransitionTests : ApiTestBase
{
    public OrderStatusTransitionTests(ApiFactory factory) : base(factory) { }

    private async Task<(OrderDto Order, int ProductId, string CustomerToken, string StaffToken)> ArrangeAsync(string prefix, int stock = 10, int quantity = 2)
    {
        var product = await SeedProductAsync($"{prefix}-A", 5.00m, stock);
        var customer = await RegisterCustomerAsync($"{prefix.ToLowerInvariant()}@example.com");
        var (_, staffToken) = await SeedAndLoginAsync($"{prefix.ToLowerInvariant()}-staff@example.com", UserRole.Staff);

        var order = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(customer.AccessToken, [(product.Id, quantity)], Guid.NewGuid().ToString()));

        return (order, product.Id, customer.AccessToken, staffToken);
    }

    [Fact]
    public async Task Test11_Happy_path_pending_confirmed_shipped()
    {
        var (order, _, _, staffToken) = await ArrangeAsync("T11A");

        var confirm = await PostAsync($"api/orders/{order.Id}/confirm", null, staffToken);
        confirm.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<OrderDto>(confirm)).Status.Should().Be(OrderStatus.Confirmed);

        var ship = await PostAsync($"api/orders/{order.Id}/ship", null, staffToken);
        ship.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<OrderDto>(ship)).Status.Should().Be(OrderStatus.Shipped);

        (await Factory.GetOrderStatusAsync(order.Id)).Should().Be(OrderStatus.Shipped);
    }

    [Fact]
    public async Task Test11_Pending_cannot_be_shipped_without_confirmation()
    {
        var (order, _, _, staffToken) = await ArrangeAsync("T11B");

        var ship = await PostAsync($"api/orders/{order.Id}/ship", null, staffToken);

        ship.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var problem = await ReadJsonAsync(ship);
        problem.GetProperty("code").GetString().Should().Be("invalid_state_transition");
        problem.GetProperty("currentStatus").GetString().Should().Be("Pending");
        problem.GetProperty("attemptedStatus").GetString().Should().Be("Shipped");

        (await Factory.GetOrderStatusAsync(order.Id)).Should().Be(OrderStatus.Pending);
    }

    [Fact]
    public async Task Test11_Reject_restores_stock_and_rejected_orders_are_terminal()
    {
        var (order, productId, _, staffToken) = await ArrangeAsync("T11C", stock: 10, quantity: 4);

        (await Factory.GetStockAsync(productId)).Should().Be(6);

        var reject = await PostAsync($"api/orders/{order.Id}/reject", null, staffToken);
        reject.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<OrderDto>(reject)).Status.Should().Be(OrderStatus.Rejected);

        (await Factory.GetStockAsync(productId)).Should().Be(10, "rejecting releases the reservation");
        (await Factory.SumMovementDeltaAsync(productId)).Should().Be(0);

        foreach (var action in new[] { "confirm", "ship", "cancel", "reject" })
        {
            var response = await PostAsync($"api/orders/{order.Id}/{action}", null, staffToken);
            response.StatusCode.Should().Be(HttpStatusCode.Conflict, "Rejected is a terminal status ({0})", action);
        }

        (await Factory.GetStockAsync(productId)).Should().Be(10, "no transition released stock a second time");
        (await Factory.CountInventoryMovementsAsync(productId)).Should().Be(2);
    }

    [Fact]
    public async Task Test11_Shipped_orders_can_no_longer_be_cancelled()
    {
        var (order, productId, customerToken, staffToken) = await ArrangeAsync("T11D", stock: 10, quantity: 3);

        (await PostAsync($"api/orders/{order.Id}/confirm", null, staffToken)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await PostAsync($"api/orders/{order.Id}/ship", null, staffToken)).StatusCode.Should().Be(HttpStatusCode.OK);

        var customerCancel = await PostAsync($"api/orders/{order.Id}/cancel", null, customerToken);
        customerCancel.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ReadJsonAsync(customerCancel)).GetProperty("currentStatus").GetString().Should().Be("Shipped");

        (await PostAsync($"api/orders/{order.Id}/cancel", null, staffToken))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await Factory.GetOrderStatusAsync(order.Id)).Should().Be(OrderStatus.Shipped);
        (await Factory.GetStockAsync(productId)).Should().Be(7, "a shipped order keeps its reservation");
    }

    [Fact]
    public async Task Test11_Customer_can_cancel_while_pending_and_confirmed_but_not_after_shipping()
    {
        var (pendingOrder, pendingProduct, customerToken, staffToken) = await ArrangeAsync("T11E1", stock: 5, quantity: 1);

        var cancel = await PostAsync($"api/orders/{pendingOrder.Id}/cancel", null, customerToken);
        cancel.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Factory.GetStockAsync(pendingProduct)).Should().Be(5);

        var (confirmedOrder, confirmedProduct, confirmedToken, _) = await ArrangeAsync("T11E2", stock: 5, quantity: 1);
        (await PostAsync($"api/orders/{confirmedOrder.Id}/confirm", null, staffToken)).StatusCode.Should().Be(HttpStatusCode.OK);

        var confirmedCancel = await PostAsync($"api/orders/{confirmedOrder.Id}/cancel", null, confirmedToken);
        confirmedCancel.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Factory.GetStockAsync(confirmedProduct)).Should().Be(5);
    }

    [Fact]
    public async Task Test11_Racing_confirm_and_reject_produces_exactly_one_winner()
    {
        var (order, productId, _, staffToken) = await ArrangeAsync("T11F", stock: 5, quantity: 1);

        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<HttpResponseMessage> Call(Func<Task<HttpResponseMessage>> action)
        {
            await gate.Task;
            return await action();
        }

        var confirm = Call(() => PostAsync($"api/orders/{order.Id}/confirm", null, staffToken));
        // Confirm and reject both require Pending. Confirm followed by cancel is a valid
        // sequence, so simultaneous request starts alone cannot guarantee one wins that pair.
        var reject = Call(() => PostAsync($"api/orders/{order.Id}/reject", null, staffToken));
        gate.SetResult();

        var responses = await Task.WhenAll(confirm, reject);

        responses.Count(r => r.StatusCode == HttpStatusCode.OK).Should().Be(1);
        responses.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(1);

        var status = await Factory.GetOrderStatusAsync(order.Id);
        status.Should().BeOneOf(OrderStatus.Confirmed, OrderStatus.Rejected);
        (await Factory.GetStockAsync(productId)).Should().Be(status == OrderStatus.Rejected ? 5 : 4);
    }
}
