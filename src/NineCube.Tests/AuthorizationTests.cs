using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// Assessment test 10. Two rules matter most here:
///   * a customer asking for somebody else's order gets 404, never 403 - the API must not leak
///     the existence of another customer's data, and
///   * separation of duties: whoever handles orders must not be able to freely change stock.
/// </summary>
public sealed class AuthorizationTests : ApiTestBase
{
    public AuthorizationTests(ApiFactory factory) : base(factory) { }

    [Fact]
    public async Task Test10_Unauthenticated_calls_return_401()
    {
        foreach (var url in new[] { "api/products", "api/orders", "api/products/low-stock", "api/admin/users", "api/auth/me" })
        {
            var response = await GetAsync(url);
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized, $"{url} requires authentication");

            var problem = await ReadJsonAsync(response);
            problem.GetProperty("code").GetString().Should().Be("unauthenticated");
            problem.GetProperty("correlationId").GetString().Should().NotBeNullOrWhiteSpace();
        }
    }

    [Fact]
    public async Task Test10_Customer_is_forbidden_from_staff_inventory_and_admin_endpoints()
    {
        var product = await SeedProductAsync("T10-A", 10.00m, stock: 5);
        var customer = await RegisterCustomerAsync("t10-a@example.com");
        var token = customer.AccessToken;

        var order = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(token, [(product.Id, 1)], Guid.NewGuid().ToString()));

        var forbidden = new List<(string Description, HttpResponseMessage Response)>
        {
            ("confirm an order", await PostAsync($"api/orders/{order.Id}/confirm", null, token)),
            ("cancel another role's action (reject)", await PostAsync($"api/orders/{order.Id}/reject", null, token)),
            ("ship an order", await PostAsync($"api/orders/{order.Id}/ship", null, token)),
            ("create a product", await PostAsync("api/products", new { sku = "X", name = "X", price = 1m }, token)),
            ("adjust stock", await PostAsync($"api/products/{product.Id}/stock-adjustments", new { delta = -1, reason = "test" }, token)),
            ("list users", await GetAsync("api/admin/users", token)),
            ("read audit logs", await GetAsync("api/admin/audit-logs", token)),
            ("read settings", await GetAsync("api/admin/settings", token)),
            ("read the sales report", await GetAsync("api/reports/sales", token)),
            ("read the low stock list", await GetAsync("api/products/low-stock", token))
        };

        foreach (var (description, response) in forbidden)
        {
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden, $"a customer must not be able to {description}");

            var problem = await ReadJsonAsync(response);
            problem.GetProperty("code").GetString().Should().Be("forbidden");
        }

        (await Factory.GetStockAsync(product.Id)).Should().Be(4, "no forbidden call may have changed anything");
    }

    [Fact]
    public async Task Test10_Customer_reading_or_cancelling_another_customers_order_gets_404()
    {
        var product = await SeedProductAsync("T10-B", 10.00m, stock: 5);
        var owner = await RegisterCustomerAsync("t10-owner@example.com");
        var stranger = await RegisterCustomerAsync("t10-stranger@example.com");

        var order = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(owner.AccessToken, [(product.Id, 2)], Guid.NewGuid().ToString()));

        (await GetAsync($"api/orders/{order.Id}", owner.AccessToken)).StatusCode.Should().Be(HttpStatusCode.OK);

        var read = await GetAsync($"api/orders/{order.Id}", stranger.AccessToken);
        read.StatusCode.Should().Be(HttpStatusCode.NotFound, "403 would leak that the order exists");
        (await ReadJsonAsync(read)).GetProperty("code").GetString().Should().Be("not_found");

        var invoice = await GetAsync($"api/orders/{order.Id}/invoice", stranger.AccessToken);
        invoice.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var cancel = await PostAsync($"api/orders/{order.Id}/cancel", null, stranger.AccessToken);
        cancel.StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await Factory.GetStockAsync(product.Id)).Should().Be(3, "the stranger could not release the reservation");
    }

    [Fact]
    public async Task Test10_Customers_only_see_their_own_orders_in_the_list()
    {
        var product = await SeedProductAsync("T10-C", 10.00m, stock: 20);
        var mine = await RegisterCustomerAsync("t10-mine@example.com");
        var theirs = await RegisterCustomerAsync("t10-theirs@example.com");

        await PlaceOrderAsync(mine.AccessToken, [(product.Id, 1)], Guid.NewGuid().ToString());
        await PlaceOrderAsync(theirs.AccessToken, [(product.Id, 1)], Guid.NewGuid().ToString());
        await PlaceOrderAsync(theirs.AccessToken, [(product.Id, 1)], Guid.NewGuid().ToString());

        var mineList = await ReadAsync<PagedResult<OrderDto>>(await GetAsync("api/orders", mine.AccessToken));
        mineList.TotalCount.Should().Be(1);

        var theirsList = await ReadAsync<PagedResult<OrderDto>>(await GetAsync("api/orders", theirs.AccessToken));
        theirsList.TotalCount.Should().Be(2);

        var (_, staffToken) = await SeedAndLoginAsync("t10-c-staff@example.com", UserRole.Staff);
        var all = await ReadAsync<PagedResult<OrderDto>>(await GetAsync("api/orders", staffToken));
        all.TotalCount.Should().Be(3, "staff see every order");
    }

    [Fact]
    public async Task Test10_Staff_cannot_touch_stock_or_products()
    {
        var product = await SeedProductAsync("T10-D", 10.00m, stock: 5);
        var (_, staffToken) = await SeedAndLoginAsync("t10-d@example.com", UserRole.Staff);

        (await PostAsync($"api/products/{product.Id}/stock-adjustments",
                new { delta = 5, reason = "staff should not be able to do this" }, staffToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await PostAsync("api/products", new { sku = "T10-D2", name = "nope", price = 1m }, staffToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await PutAsync($"api/products/{product.Id}", new { name = "nope", price = 1m, isActive = true }, staffToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await Factory.GetStockAsync(product.Id)).Should().Be(5);

        // ...but staff can absolutely do their own job.
        (await GetAsync("api/orders", staffToken)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await GetAsync("api/reports/sales", staffToken)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await GetAsync("api/products/low-stock", staffToken)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Test10_Inventory_manager_cannot_change_order_status()
    {
        var product = await SeedProductAsync("T10-E", 10.00m, stock: 5);
        var customer = await RegisterCustomerAsync("t10-e@example.com");
        var (_, inventoryToken) = await SeedAndLoginAsync("t10-e-inv@example.com", UserRole.InventoryManager);

        var order = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)], Guid.NewGuid().ToString()));

        (await PostAsync($"api/orders/{order.Id}/confirm", null, inventoryToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await PostAsync($"api/orders/{order.Id}/ship", null, inventoryToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await PostAsync($"api/orders/{order.Id}/cancel", null, inventoryToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await Factory.GetOrderStatusAsync(order.Id)).Should().Be(OrderStatus.Pending);

        // ...but the inventory manager owns the catalogue.
        (await GetAsync($"api/products/{product.Id}/movements", inventoryToken))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Test10_Administrator_role_change_takes_effect_on_existing_tokens()
    {
        var product = await SeedProductAsync("T10-F", 10.00m, stock: 5);
        var customer = await RegisterCustomerAsync("t10-f@example.com");
        var (_, adminToken) = await SeedAndLoginAsync("t10-f-admin@example.com", UserRole.Administrator);

        var order = await ReadAsync<OrderDto>(
            await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)], Guid.NewGuid().ToString()));

        (await PostAsync($"api/orders/{order.Id}/confirm", null, customer.AccessToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var change = await PutAsync($"api/admin/users/{customer.User.Id}/role", new { role = "Staff" }, adminToken);
        change.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<AdminUserDto>(change)).Role.Should().Be(UserRole.Staff);

        // The role claim is re-read from the database on every request, so the SAME token now works.
        (await PostAsync($"api/orders/{order.Id}/confirm", null, customer.AccessToken))
            .StatusCode.Should().Be(HttpStatusCode.OK, "the new role applies immediately");

        (await Factory.GetOrderStatusAsync(order.Id)).Should().Be(OrderStatus.Confirmed);
    }

    [Fact]
    public async Task Test10_Deactivated_user_cannot_log_in_and_loses_access()
    {
        var (_, adminToken) = await SeedAndLoginAsync("t10-g-admin@example.com", UserRole.Administrator);
        var (staff, staffToken) = await SeedAndLoginAsync("t10-g-staff@example.com", UserRole.Staff);

        (await GetAsync("api/orders", staffToken)).StatusCode.Should().Be(HttpStatusCode.OK);

        var deactivate = await PutAsync($"api/admin/users/{staff.Id}/active", new { isActive = false }, adminToken);
        deactivate.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<AdminUserDto>(deactivate)).IsActive.Should().BeFalse();

        var login = await Client.PostAsJsonAsync("api/auth/login",
            new LoginRequest(staff.Email, ValidPassword), Json);
        login.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        (await GetAsync("api/orders", staffToken))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized, "issued tokens stop working as well");
    }

    [Fact]
    public async Task Test10_Administrator_cannot_remove_the_last_administrator()
    {
        var (admin, adminToken) = await SeedAndLoginAsync("t10-h-admin@example.com", UserRole.Administrator);

        (await PutAsync($"api/admin/users/{admin.Id}/role", new { role = "Staff" }, adminToken))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await PutAsync($"api/admin/users/{admin.Id}/active", new { isActive = false }, adminToken))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Test10_Administrator_can_read_everything_but_cannot_place_orders()
    {
        var product = await SeedProductAsync("T10-I", 10.00m, stock: 5);
        var (_, adminToken) = await SeedAndLoginAsync("t10-i-admin@example.com", UserRole.Administrator);

        foreach (var url in new[] { "api/products", "api/orders", "api/reports/sales", "api/admin/audit-logs", "api/admin/settings" })
        {
            (await GetAsync(url, adminToken)).StatusCode.Should().Be(HttpStatusCode.OK, $"{url} is readable by an administrator");
        }

        (await PostAsync("api/orders", new { items = new[] { new { productId = product.Id, quantity = 1 } } }, adminToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await PostAsync($"api/products/{product.Id}/stock-adjustments", new { delta = -1, reason = "admin read-only" }, adminToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden, "the administrator is read-only on inventory");

        (await Factory.CountOrdersAsync()).Should().Be(0);
    }
}
