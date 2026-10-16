using System.Net;
using FluentAssertions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// Notifications are raised inside the transaction that writes the event, so the interesting
/// assertions are always paired: the order exists if and only if the inbox row exists, and
/// nobody can read or change a row that is not theirs.
/// </summary>
public sealed class NotificationTests : ApiTestBase
{
    public NotificationTests(ApiFactory factory) : base(factory) { }

    private async Task<List<NotificationDto>> InboxAsync(string token, bool unreadOnly = false)
    {
        var suffix = unreadOnly ? "?unreadOnly=true" : string.Empty;
        var page = await ReadAsync<PagedResult<NotificationDto>>(await GetAsync($"api/notifications{suffix}", token));
        return page.Items.ToList();
    }

    private async Task<int> UnreadAsync(string token) =>
        (await ReadAsync<UnreadCountDto>(await GetAsync("api/notifications/unread-count", token))).Count;

    // ------------------------------------------------------------------ events

    [Fact]
    public async Task Placing_an_order_notifies_the_customer_and_every_staff_account()
    {
        var product = await SeedProductAsync("N-01", 20.00m, stock: 10);
        var customer = await RegisterCustomerAsync("n01@example.com");
        await SeedAndLoginAsync("n01-staff@example.com", UserRole.Staff);
        await SeedAndLoginAsync("n01-inv@example.com", UserRole.InventoryManager);

        var response = await PlaceOrderAsync(customer.AccessToken, [(product.Id, 2)]);
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var own = await InboxAsync(customer.AccessToken);
        own.Should().ContainSingle(n => n.Type == NotificationType.OrderPlaced);
        own.Single(n => n.Type == NotificationType.OrderPlaced).Link.Should().StartWith("/orders/");

        var staff = await InboxAsync((await LoginAsync("n01-staff@example.com", ValidPassword)).AccessToken);
        staff.Should().ContainSingle(n => n.Type == NotificationType.NewOrder);

        var inventory = await InboxAsync((await LoginAsync("n01-inv@example.com", ValidPassword)).AccessToken);
        inventory.Should().ContainSingle(n => n.Type == NotificationType.NewOrder,
            "every active staff role is a recipient, not only Staff");
    }

    [Fact]
    public async Task A_rejected_order_writes_no_notification_at_all()
    {
        var product = await SeedProductAsync("N-02", 20.00m, stock: 1);
        var customer = await RegisterCustomerAsync("n02@example.com");

        var response = await PlaceOrderAsync(customer.AccessToken, [(product.Id, 4)]);
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await UnreadAsync(customer.AccessToken)).Should().Be(0,
            "the notification shares the transaction, so a rolled back order leaves nothing behind");
        (await Factory.CountOrdersAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_status_change_notifies_the_owning_customer()
    {
        var product = await SeedProductAsync("N-03", 15.00m, stock: 10);
        var customer = await RegisterCustomerAsync("n03@example.com");
        var (_, staffToken) = await SeedAndLoginAsync("n03-staff@example.com", UserRole.Staff);

        var order = await ReadAsync<OrderDto>(await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)]));

        var confirm = await PostAsync($"api/orders/{order.Id}/confirm", null, staffToken);
        confirm.StatusCode.Should().Be(HttpStatusCode.OK);

        var inbox = await InboxAsync(customer.AccessToken);
        inbox.Should().Contain(n => n.Type == NotificationType.OrderStatusChanged && n.Title.Contains("confirmed"));

        var cancel = await PostAsync($"api/orders/{order.Id}/cancel", null, staffToken);
        cancel.StatusCode.Should().Be(HttpStatusCode.OK);

        inbox = await InboxAsync(customer.AccessToken);
        inbox.Should().Contain(n => n.Type == NotificationType.OrderCancelled);
    }

    [Fact]
    public async Task Low_stock_reaches_staff_once_and_is_not_duplicated()
    {
        // Threshold defaults to 5; buying 8 of 10 leaves 2.
        var product = await SeedProductAsync("N-04", 5.00m, stock: 10);
        var customer = await RegisterCustomerAsync("n04@example.com");
        var (_, staffToken) = await SeedAndLoginAsync("n04-staff@example.com", UserRole.InventoryManager);

        await PlaceOrderAsync(customer.AccessToken, [(product.Id, 8)]);

        var first = await InboxAsync(staffToken);
        first.Should().ContainSingle(n => n.Type == NotificationType.LowStock && n.Body.Contains(product.Sku));

        // A second order on the same depleted product must not spam the inbox again.
        await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)]);

        var second = await InboxAsync(staffToken);
        second.Count(n => n.Type == NotificationType.LowStock).Should().Be(1);
    }

    // ------------------------------------------------------------------ reading and marking

    [Fact]
    public async Task Unread_count_and_the_unread_only_filter_always_agree()
    {
        var product = await SeedProductAsync("N-05", 4.00m, stock: 10);
        var customer = await RegisterCustomerAsync("n05@example.com");
        await SeedAndLoginAsync("n05-staff@example.com", UserRole.Staff);

        var order = await ReadAsync<OrderDto>(await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)]));
        await PostAsync($"api/orders/{order.Id}/confirm", null, (await LoginAsync("n05-staff@example.com", ValidPassword)).AccessToken);

        var all = await InboxAsync(customer.AccessToken);
        var unread = await InboxAsync(customer.AccessToken, unreadOnly: true);

        (await UnreadAsync(customer.AccessToken)).Should().Be(unread.Count);
        unread.Should().OnlyContain(n => !n.IsRead);
        all.Should().HaveCountGreaterThanOrEqualTo(unread.Count);
    }

    [Fact]
    public async Task Marking_read_sets_the_timestamp_once_and_read_all_clears_the_badge()
    {
        var product = await SeedProductAsync("N-06", 3.00m, stock: 10);
        var customer = await RegisterCustomerAsync("n06@example.com");

        await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)]);
        var first = (await InboxAsync(customer.AccessToken)).Single();

        var marked = await ReadAsync<NotificationDto>(await PostAsync($"api/notifications/{first.Id}/read", null, customer.AccessToken));
        marked.IsRead.Should().BeTrue();
        marked.ReadAt.Should().NotBeNull();

        // A second call is a no-op rather than a fresh timestamp.
        var again = await ReadAsync<NotificationDto>(await PostAsync($"api/notifications/{first.Id}/read", null, customer.AccessToken));
        again.ReadAt.Should().Be(marked.ReadAt);

        await PlaceOrderAsync(customer.AccessToken, [(product.Id, 1)]);
        (await UnreadAsync(customer.AccessToken)).Should().Be(1);

        var readAll = await PostAsync("api/notifications/read-all", null, customer.AccessToken);
        readAll.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadAsync<UnreadCountDto>(readAll)).Count.Should().Be(1);
        (await UnreadAsync(customer.AccessToken)).Should().Be(0);
    }

    [Fact]
    public async Task Another_users_notification_is_a_404_for_reading_marking_and_deleting()
    {
        var product = await SeedProductAsync("N-07", 6.00m, stock: 10);
        var owner = await RegisterCustomerAsync("n07-owner@example.com");
        var stranger = await RegisterCustomerAsync("n07-stranger@example.com");

        await PlaceOrderAsync(owner.AccessToken, [(product.Id, 1)]);
        var owned = (await InboxAsync(owner.AccessToken)).Single();

        // The list never shows the other user's row in the first place.
        (await InboxAsync(stranger.AccessToken)).Should().BeEmpty();

        var mark = await PostAsync($"api/notifications/{owned.Id}/read", null, stranger.AccessToken);
        mark.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ReadJsonAsync(mark)).GetProperty("code").GetString().Should().Be("not_found");

        (await DeleteAsync($"api/notifications/{owned.Id}", stranger.AccessToken)).StatusCode
            .Should().Be(HttpStatusCode.NotFound);

        // Still unread for its real owner, and still present.
        (await UnreadAsync(owner.AccessToken)).Should().Be(1);
        (await InboxAsync(owner.AccessToken)).Should().ContainSingle();

        (await DeleteAsync($"api/notifications/{owned.Id}", owner.AccessToken)).StatusCode
            .Should().Be(HttpStatusCode.NoContent);
        (await InboxAsync(owner.AccessToken)).Should().BeEmpty();
    }

    [Fact]
    public async Task The_inbox_requires_a_login()
    {
        var anonymous = await GetAsync("api/notifications");
        anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        (await GetAsync("api/notifications/unread-count")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized);
    }
}
