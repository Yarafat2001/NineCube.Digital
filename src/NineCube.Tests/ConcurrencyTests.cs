using System.Net;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// Assessment tests 7 and 8. These are the tests that justify the whole design, and they only
/// mean anything on a real SQL Server: they need genuine row locks and a real CHECK constraint.
/// An InMemory or SQLite provider would happily let both requests "succeed".
/// </summary>
public sealed class ConcurrencyTests : ApiTestBase
{
    public ConcurrencyTests(ApiFactory factory) : base(factory) { }

    // ------------------------------------------------------------------ 7

    [Fact]
    public async Task Test07_Race_for_the_last_unit_produces_exactly_one_success_and_one_conflict()
    {
        var product = await SeedProductAsync("T07-A", 9.00m, stock: 1);
        var first = await RegisterCustomerAsync("t07-1@example.com");
        var second = await RegisterCustomerAsync("t07-2@example.com");

        // Release both requests at the same instant so they genuinely overlap.
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<HttpResponseMessage> PlaceOrder(string token)
        {
            await gate.Task;
            return await PlaceOrderAsync(token, [(product.Id, 1)], Guid.NewGuid().ToString());
        }

        var firstRequest = PlaceOrder(first.AccessToken);
        var secondRequest = PlaceOrder(second.AccessToken);
        gate.SetResult();

        var responses = await Task.WhenAll(firstRequest, secondRequest);

        responses.Count(r => r.StatusCode == HttpStatusCode.Created)
            .Should().Be(1, "only one order can win the last unit");
        responses.Count(r => r.StatusCode == HttpStatusCode.Conflict)
            .Should().Be(1, "the loser must be told the stock is gone, not served a 500");

        responses.Should().OnlyContain(r => (int)r.StatusCode < 500);

        (await Factory.GetStockAsync(product.Id)).Should().Be(0);
        (await Factory.CountOrdersAsync()).Should().Be(1);

        var conflict = responses.Single(r => r.StatusCode == HttpStatusCode.Conflict);
        var problem = await ReadJsonAsync(conflict);
        problem.GetProperty("code").GetString().Should().Be("insufficient_stock");
    }

    // ------------------------------------------------------------------ 8

    [Fact]
    public async Task Test08_Fifty_parallel_orders_for_ten_units_yield_exactly_ten_successes()
    {
        const int stock = 10;
        const int attempts = 50;

        var product = await SeedProductAsync("T08-A", 1.00m, stock);
        var customer = await RegisterCustomerAsync("t08@example.com");

        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var requests = Enumerable.Range(0, attempts).Select(async _ =>
        {
            await gate.Task;
            return await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)], Guid.NewGuid().ToString());
        }).ToList();

        gate.SetResult();
        var responses = await Task.WhenAll(requests);

        responses.Count(r => r.StatusCode == HttpStatusCode.Created).Should().Be(stock);
        responses.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(attempts - stock);
        responses.Where(r => (int)r.StatusCode >= 500)
            .Should().BeEmpty("business failures must never surface as a 5xx");

        (await Factory.GetStockAsync(product.Id)).Should().Be(0, "stock never goes negative");
        (await Factory.SumOrderItemQuantitiesAsync())
            .Should().Be(stock, "exactly ten units were sold - no oversell, no lost update");

        var storedOrders = await Factory.QueryAsync(db =>
            Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                .ToListAsync(db.Orders.Select(o => o.Id)));

        storedOrders.Should().HaveCount(stock);
    }

    [Fact]
    public async Task Test08b_Concurrent_multi_line_orders_keep_every_ledger_and_stock_consistent()
    {
        // Two products ordered in the same order, many times in parallel: the ascending-ProductId
        // ordering is what stops these from deadlocking against each other.
        var first = await SeedProductAsync("T08b-A", 2.00m, stock: 20);
        var second = await SeedProductAsync("T08b-B", 3.00m, stock: 20);
        var customer = await RegisterCustomerAsync("t08b@example.com");

        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var requests = Enumerable.Range(0, 20).Select(async _ =>
        {
            await gate.Task;
            return await PlaceOrderAsync(customer.AccessToken, [(first.Id, 1), (second.Id, 1)], Guid.NewGuid().ToString());
        }).ToList();

        gate.SetResult();
        var responses = await Task.WhenAll(requests);

        responses.Should().OnlyContain(r => r.StatusCode == HttpStatusCode.Created);

        (await Factory.GetStockAsync(first.Id)).Should().Be(0);
        (await Factory.GetStockAsync(second.Id)).Should().Be(0);
        (await Factory.SumMovementDeltaAsync(first.Id)).Should().Be(-20);
        (await Factory.SumMovementDeltaAsync(second.Id)).Should().Be(-20);
    }
}
