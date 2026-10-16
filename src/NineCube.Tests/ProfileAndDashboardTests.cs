using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// The customer-facing account surface: /api/me, its password and address sub-resources, and the
/// dashboard. Every route takes its subject from the token, so the tests spend most of their time
/// proving that a second customer simply cannot reach these rows.
/// </summary>
public sealed class ProfileAndDashboardTests(ApiFactory factory) : ApiTestBase(factory)
{
    private static AddressRequest Address(string label, bool isDefault = false) =>
        new(label, "Dhaka Division", "Dhaka District", "Gulshan", $"House 12, Road 5, {label}", "01711223344", isDefault);

    // ------------------------------------------------------------------ profile

    [Fact]
    public async Task The_profile_reports_the_login_email_and_stores_name_and_phone()
    {
        var customer = await RegisterCustomerAsync("p-01@example.com", "Rahim Uddin");
        var token = customer.AccessToken;

        var profile = await ReadAsync<ProfileDto>(await GetAsync("api/me", token));
        profile.Email.Should().Be("p-01@example.com");
        profile.Name.Should().Be("Rahim Uddin");
        profile.Role.Should().Be(UserRole.Customer);
        profile.Addresses.Should().BeEmpty();

        var updated = await ReadAsync<ProfileDto>(await PutAsync("api/me", new { name = "Rahimul Uddin", phone = "01812345678" }, token));
        updated.Name.Should().Be("Rahimul Uddin");
        updated.Phone.Should().Be("01812345678");

        // The email is the login identity: sending a different one must not move it.
        var rewritten = await ReadAsync<ProfileDto>(await PutAsync("api/me", new { name = "Rahimul Uddin", phone = "01812345678", email = "hacker@example.com" }, token));
        rewritten.Email.Should().Be("p-01@example.com");
    }

    [Fact]
    public async Task An_invalid_profile_update_is_a_bad_request_with_field_errors()
    {
        var customer = await RegisterCustomerAsync("p-02@example.com");

        var emptyName = await PutAsync("api/me", new { name = "  ", phone = (string?)null }, customer.AccessToken);
        emptyName.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJsonAsync(emptyName)).GetProperty("code").GetString().Should().Be("invalid_request");

        var badPhone = await PutAsync("api/me", new { name = "Ok Name", phone = "abc" }, customer.AccessToken);
        badPhone.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task The_password_change_needs_the_current_password_and_the_new_one_then_works()
    {
        var customer = await RegisterCustomerAsync("p-03@example.com");
        const string next = "N3w!passw0rd";

        var wrong = await PutAsync("api/me/password", new { currentPassword = "not-it", newPassword = next }, customer.AccessToken);
        wrong.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJsonAsync(wrong)).GetProperty("errors").GetProperty("currentPassword")[0].GetString()
            .Should().Contain("current password");

        var tooShort = await PutAsync("api/me/password", new { currentPassword = ValidPassword, newPassword = "short" }, customer.AccessToken);
        tooShort.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var same = await PutAsync("api/me/password", new { currentPassword = ValidPassword, newPassword = ValidPassword }, customer.AccessToken);
        same.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var changed = await PutAsync("api/me/password", new { currentPassword = ValidPassword, newPassword = next }, customer.AccessToken);
        changed.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var login = await Client.PostAsJsonAsync("api/auth/login", new LoginRequest("p-03@example.com", next), Json);
        login.StatusCode.Should().Be(HttpStatusCode.OK);

        var old = await Client.PostAsJsonAsync("api/auth/login", new LoginRequest("p-03@example.com", ValidPassword), Json);
        old.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ------------------------------------------------------------------ addresses

    [Fact]
    public async Task Addresses_are_created_edited_and_deleted_with_exactly_one_default()
    {
        var customer = await RegisterCustomerAsync("p-04@example.com");
        var token = customer.AccessToken;

        var home = await ReadAsync<AddressDto>(await PostAsync("api/me/addresses", Address("Home"), token));
        home.IsDefault.Should().BeTrue("the first address becomes the default whether asked or not");

        var office = await ReadAsync<AddressDto>(await PostAsync("api/me/addresses", Address("Office", isDefault: true), token));
        office.IsDefault.Should().BeTrue();

        var list = await ReadAsync<List<AddressDto>>(await GetAsync("api/me/addresses", token));
        list.Should().HaveCount(2);
        list.Count(a => a.IsDefault).Should().Be(1);
        list.Single(a => a.IsDefault).Id.Should().Be(office.Id);

        var moved = await ReadAsync<AddressDto>(await PutAsync($"api/me/addresses/{home.Id}", Address("Home", isDefault: true), token));
        moved.IsDefault.Should().BeTrue();

        list = await ReadAsync<List<AddressDto>>(await GetAsync("api/me/addresses", token));
        list.Single(a => a.Id == office.Id).IsDefault.Should().BeFalse();

        // A default that is deleted hands the role to the remaining row.
        (await DeleteAsync($"api/me/addresses/{home.Id}", token)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        list = await ReadAsync<List<AddressDto>>(await GetAsync("api/me/addresses", token));
        list.Should().ContainSingle();
        list.Single().Id.Should().Be(office.Id);
        list.Single().IsDefault.Should().BeTrue();

        (await Factory.QueryAsync(db => db.Addresses.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task An_incomplete_address_is_rejected_with_per_field_errors()
    {
        var customer = await RegisterCustomerAsync("p-05@example.com");

        var response = await PostAsync("api/me/addresses",
            new { label = "Nowhere", division = "", district = "", upazila = "Gulshan", addressLine = "" },
            customer.AccessToken);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var errors = (await ReadJsonAsync(response)).GetProperty("errors");
        errors.GetProperty("division")[0].GetString().Should().NotBeNullOrWhiteSpace();
        errors.GetProperty("addressLine")[0].GetString().Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Another_customers_address_id_is_a_404_not_a_403()
    {
        var owner = await RegisterCustomerAsync("p-06-owner@example.com");
        var stranger = await RegisterCustomerAsync("p-06-stranger@example.com");

        var created = await ReadAsync<AddressDto>(await PostAsync("api/me/addresses", Address("Home"), owner.AccessToken));

        (await GetAsync("api/me/addresses", stranger.AccessToken)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<List<AddressDto>>(await GetAsync("api/me/addresses", stranger.AccessToken))).Should().BeEmpty();

        (await PutAsync($"api/me/addresses/{created.Id}", Address("Hijacked"), stranger.AccessToken))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await DeleteAsync($"api/me/addresses/{created.Id}", stranger.AccessToken))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);

        // Untouched for its real owner.
        var list = await ReadAsync<List<AddressDto>>(await GetAsync("api/me/addresses", owner.AccessToken));
        list.Should().ContainSingle(a => a.Label == "Home");
    }

    // ------------------------------------------------------------------ dashboard

    [Fact]
    public async Task A_new_customer_sees_an_empty_dashboard()
    {
        var customer = await RegisterCustomerAsync("p-07@example.com");

        var dashboard = await ReadAsync<DashboardDto>(await GetAsync("api/me/dashboard", customer.AccessToken));

        dashboard.TotalOrders.Should().Be(0);
        dashboard.TotalSpent.Should().Be(0m);
        dashboard.RecentOrders.Should().BeEmpty();
        dashboard.RecentNotifications.Should().BeEmpty();
        dashboard.UnreadNotifications.Should().Be(0);
        dashboard.OrdersByStatus.Should().HaveCount(5, "the cards are always rendered, even at zero");
    }

    [Fact]
    public async Task Dashboard_totals_match_the_orders_table_including_the_cancellation()
    {
        var product = await SeedProductAsync("P-08-A", 25.00m, stock: 50);
        var customer = await RegisterCustomerAsync("p-08@example.com");
        var (_, staffToken) = await SeedAndLoginAsync("p-08-staff@example.com", UserRole.Staff);

        var first = await ReadAsync<OrderDto>(await PlaceOrderAsync(customer.AccessToken, [(product.Id, 2)]));
        var second = await ReadAsync<OrderDto>(await PlaceOrderAsync(customer.AccessToken, [(product.Id, 3)]));
        var third = await ReadAsync<OrderDto>(await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)]));

        // Cancel the second one: its money must drop out of "spent".
        (await PostAsync($"api/orders/{second.Id}/cancel", null, staffToken)).StatusCode.Should().Be(HttpStatusCode.OK);

        var dashboard = await ReadAsync<DashboardDto>(await GetAsync("api/me/dashboard", customer.AccessToken));

        dashboard.TotalOrders.Should().Be(3);
        dashboard.TotalSpent.Should().Be(first.TotalAmount + third.TotalAmount);
        dashboard.TotalItems.Should().Be(3, "the cancelled lines are not spent items");
        dashboard.Currency.Should().Be("BDT");
        dashboard.OrdersByStatus.Single(s => s.Status == nameof(OrderStatus.Pending)).Count.Should().Be(2);
        dashboard.OrdersByStatus.Single(s => s.Status == nameof(OrderStatus.Cancelled)).Count.Should().Be(1);

        dashboard.RecentOrders.Should().HaveCount(3);
        dashboard.RecentOrders.Should().OnlyContain(o => o.ItemCount > 0);

        // Two events for the customer per order plus the cancellation notice.
        dashboard.UnreadNotifications.Should().Be(4);
        dashboard.RecentNotifications.Should().HaveCount(4);
        dashboard.RecentNotifications.Should().OnlyContain(n => !n.IsRead);
    }

    [Fact]
    public async Task A_staff_login_gets_a_dashboard_with_no_orders_but_its_own_notifications()
    {
        var product = await SeedProductAsync("P-09-A", 10.00m, stock: 5);
        var customer = await RegisterCustomerAsync("p-09@example.com");
        var (_, staffToken) = await SeedAndLoginAsync("p-09-staff@example.com", UserRole.Staff);

        await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)]);

        var dashboard = await ReadAsync<DashboardDto>(await GetAsync("api/me/dashboard", staffToken));

        dashboard.TotalOrders.Should().Be(0, "a staff account has no customer record to aggregate");
        dashboard.TotalSpent.Should().Be(0m);
        dashboard.UnreadNotifications.Should().BeGreaterThan(0, "staff still get their new-order inbox");
    }

    [Fact]
    public async Task The_account_routes_require_a_login()
    {
        foreach (var url in new[] { "api/me", "api/me/dashboard", "api/me/addresses", "api/notifications" })
        {
            (await GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.Unauthorized, url);
        }
    }
}
