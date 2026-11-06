using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// The customer-support chat and its grounded assistant. The interesting invariants are the
/// visibility rules (a customer never sees - or leaks - anybody else's thread or order) and the
/// honesty rule: the assistant only ever reports rows that really exist in the database.
/// </summary>
public sealed class ChatTests : ApiTestBase
{
    public ChatTests(ApiFactory factory) : base(factory) { }

    // ------------------------------------------------------------------ contract shapes

    private sealed record LastMessage(string Body, string AuthorKind, DateTime CreatedAt);
    private sealed record Summary(int Id, string Subject, string Status, DateTime CreatedAt, DateTime UpdatedAt,
        LastMessage? LastMessage, int UnreadCount);
    private sealed record Msg(int Id, int ConversationId, string AuthorKind, string AuthorName, string Body, DateTime CreatedAt);
    private sealed record MessageEnvelope(Msg Message);
    private sealed record Match(string Kind, int? Id, string Title, string Detail, string Link);
    private sealed record AssistantResponse(Msg Reply, Match[] Matches);

    private async Task<int> OpenChatAsync(string token, string message, string? subject = null)
    {
        var response = await PostAsync("api/chat/conversations", new { subject, message }, token);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return (await ReadJsonAsync(response)).GetProperty("id").GetInt32();
    }

    private async Task<Msg[]> MessagesAsync(string token, int conversationId, int? afterId = null)
    {
        var url = $"api/chat/conversations/{conversationId}/messages" + (afterId is int after ? $"?afterId={after}" : "");
        var response = await GetAsync(url, token);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await ReadAsync<Msg[]>(response);
    }

    // ------------------------------------------------------------------ conversations

    [Fact]
    public async Task A_customer_opens_a_conversation_and_reads_it_back()
    {
        var customer = await RegisterCustomerAsync("chat01@example.com", "Chat Customer");

        var id = await OpenChatAsync(customer.AccessToken, "My laptop screen flickers");

        var list = await ReadAsync<Summary[]>(await GetAsync("api/chat/conversations", customer.AccessToken));
        var summary = list.Should().ContainSingle().Subject;
        summary.Id.Should().Be(id);
        summary.Subject.Should().Be("Support chat", "no subject was supplied, so the default applies");
        summary.Status.Should().Be("open");
        summary.UnreadCount.Should().Be(0, "the customer wrote the only message");
        summary.LastMessage!.Body.Should().Be("My laptop screen flickers");
        summary.LastMessage.AuthorKind.Should().Be("customer");

        var messages = await MessagesAsync(customer.AccessToken, id);
        messages.Should().ContainSingle();
        messages[0].AuthorKind.Should().Be("customer");
        messages[0].AuthorName.Should().Be("Chat Customer");
        messages[0].ConversationId.Should().Be(id);
    }

    [Fact]
    public async Task Another_customer_gets_a_404_for_somebody_elses_conversation()
    {
        var owner = await RegisterCustomerAsync("chat02-owner@example.com");
        var stranger = await RegisterCustomerAsync("chat02-stranger@example.com");

        var id = await OpenChatAsync(owner.AccessToken, "Where is my parcel?");

        // The list never shows it in the first place...
        (await ReadAsync<Summary[]>(await GetAsync("api/chat/conversations", stranger.AccessToken))).Should().BeEmpty();

        // ...and every direct access is a 404, so existence never leaks.
        (await GetAsync($"api/chat/conversations/{id}/messages", stranger.AccessToken)).StatusCode
            .Should().Be(HttpStatusCode.NotFound);
        (await PostAsync($"api/chat/conversations/{id}/messages", new { body = "let me in" }, stranger.AccessToken)).StatusCode
            .Should().Be(HttpStatusCode.NotFound);
        (await ReadJsonAsync(await GetAsync($"api/chat/conversations/{id}/messages", stranger.AccessToken)))
            .GetProperty("code").GetString().Should().Be("not_found");
    }

    [Fact]
    public async Task Staff_see_every_conversation_can_reply_and_close()
    {
        var alice = await RegisterCustomerAsync("chat03-alice@example.com", "Alice");
        var bob = await RegisterCustomerAsync("chat03-bob@example.com", "Bob");
        var (_, staffToken) = await SeedAndLoginAsync("chat03-staff@example.com", UserRole.Staff);

        var aliceChat = await OpenChatAsync(alice.AccessToken, "Alice question");
        var bobChat = await OpenChatAsync(bob.AccessToken, "Bob question");

        var queue = await ReadAsync<Summary[]>(await GetAsync("api/chat/conversations", staffToken));
        queue.Should().HaveCount(2, "staff see every customer's threads");
        queue.Select(c => c.Id).Should().BeEquivalentTo(new[] { aliceChat, bobChat });

        var reply = await PostAsync($"api/chat/conversations/{aliceChat}/messages", new { body = "Alice, we are on it" }, staffToken);
        reply.StatusCode.Should().Be(HttpStatusCode.OK);
        var posted = (await ReadAsync<MessageEnvelope>(reply)).Message;
        posted.AuthorKind.Should().Be("staff");
        posted.ConversationId.Should().Be(aliceChat);

        // The staff reply reached the owning customer, as a message and as a notification.
        var aliceMessages = await MessagesAsync(alice.AccessToken, aliceChat);
        aliceMessages.Should().HaveCount(2);
        aliceMessages[1].Id.Should().Be(posted.Id);
        var aliceList = await ReadAsync<Summary[]>(await GetAsync("api/chat/conversations", alice.AccessToken));
        aliceList.Single().UnreadCount.Should().Be(1, "one message not authored by the customer since the customer last posted");
        var inbox = await ReadAsync<PagedResult<NotificationDto>>(await GetAsync("api/notifications", alice.AccessToken));
        inbox.Items.Should().Contain(n => n.Type == NotificationType.ChatMessage);

        var close = await PostAsync($"api/chat/conversations/{aliceChat}/close", null, staffToken);
        close.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadJsonAsync(close)).GetProperty("status").GetString().Should().Be("closed");

        // Bob's thread is untouched, and a customer may not close anything.
        (await PostAsync($"api/chat/conversations/{bobChat}/close", null, bob.AccessToken)).StatusCode
            .Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Opening_a_chat_notifies_the_staff_team()
    {
        var customer = await RegisterCustomerAsync("chat04@example.com", "Notifier");
        var (_, staffToken) = await SeedAndLoginAsync("chat04-staff@example.com", UserRole.Staff);

        await OpenChatAsync(customer.AccessToken, "Hello team");

        var inbox = await ReadAsync<PagedResult<NotificationDto>>(await GetAsync("api/notifications", staffToken));
        inbox.Items.Should().ContainSingle(n => n.Type == NotificationType.ChatMessage && n.Body.Contains("Notifier"));
    }

    // ------------------------------------------------------------------ validation

    [Fact]
    public async Task Empty_and_oversized_messages_are_rejected()
    {
        var customer = await RegisterCustomerAsync("chat05@example.com");
        var id = await OpenChatAsync(customer.AccessToken, "first");

        var empty = await PostAsync("api/chat/conversations", new { message = "   " }, customer.AccessToken);
        empty.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJsonAsync(empty)).GetProperty("code").GetString().Should().Be("invalid_request");

        var oversized = await PostAsync("api/chat/conversations", new { message = new string('a', 2001) }, customer.AccessToken);
        oversized.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var oversizedReply = await PostAsync($"api/chat/conversations/{id}/messages", new { body = new string('b', 2001) }, customer.AccessToken);
        oversizedReply.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var emptyAssistant = await PostAsync("api/chat/assistant", new { question = "" }, customer.AccessToken);
        emptyAssistant.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // Exactly 2000 characters is still fine.
        (await PostAsync($"api/chat/conversations/{id}/messages", new { body = new string('c', 2000) }, customer.AccessToken))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ------------------------------------------------------------------ polling

    [Fact]
    public async Task AfterId_returns_only_the_newer_messages()
    {
        var customer = await RegisterCustomerAsync("chat06@example.com");
        var id = await OpenChatAsync(customer.AccessToken, "one");

        await PostAsync($"api/chat/conversations/{id}/messages", new { body = "two" }, customer.AccessToken);
        await PostAsync($"api/chat/conversations/{id}/messages", new { body = "three" }, customer.AccessToken);

        var all = await MessagesAsync(customer.AccessToken, id);
        all.Should().HaveCount(3);
        // The transcript is oldest first.
        all.Select(m => m.Body).Should().ContainInOrder("one", "two", "three");

        var newer = await MessagesAsync(customer.AccessToken, id, afterId: all[0].Id);
        newer.Select(m => m.Body).Should().Equal("two", "three");

        (await MessagesAsync(customer.AccessToken, id, afterId: all[2].Id)).Should().BeEmpty();
    }

    // ------------------------------------------------------------------ assistant

    [Fact]
    public async Task The_assistant_answers_with_real_catalogue_rows()
    {
        var product = await SeedProductAsync("CHAT-01", 250.50m, stock: 7);
        var customer = await RegisterCustomerAsync("chat07@example.com");

        var response = await PostAsync("api/chat/assistant", new { question = "Do you have the test product chat-01?" }, customer.AccessToken);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var assistant = await ReadAsync<AssistantResponse>(response);

        assistant.Reply.AuthorKind.Should().Be("assistant");
        assistant.Reply.AuthorName.Should().Be("NineCube Assistant");
        assistant.Reply.ConversationId.Should().Be(0, "no conversation was supplied, so nothing is persisted");

        var match = assistant.Matches.Should().ContainSingle().Subject;
        match.Kind.Should().Be("product");
        match.Id.Should().Be(product.Id);
        match.Title.Should().Be(product.Name);
        match.Link.Should().Be($"/products/{product.Id}");
        assistant.Reply.Body.Should().Contain(product.Name);
        assistant.Reply.Body.Should().Contain("BDT 250.50", "the price is quoted exactly as stored");
        assistant.Reply.Body.Should().Contain("7 available", "the stock figure is quoted exactly as stored");

        // Nothing was persisted anywhere.
        (await Factory.QueryAsync(db => db.ChatMessages.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task The_assistant_falls_back_honestly_and_persists_inside_a_visible_conversation()
    {
        var customer = await RegisterCustomerAsync("chat08@example.com");
        var stranger = await RegisterCustomerAsync("chat08-stranger@example.com");
        var id = await OpenChatAsync(customer.AccessToken, "hello");

        var unmatched = await ReadAsync<AssistantResponse>(await PostAsync("api/chat/assistant",
            new { question = "Can you certify a unicycle for lunar dust collection?" }, customer.AccessToken));
        unmatched.Matches.Should().BeEmpty();
        unmatched.Reply.Body.Should().Contain("could not find");
        unmatched.Reply.Body.Should().Contain("human support agent", "the fallback hands over to the team");

        var persisted = await ReadAsync<AssistantResponse>(await PostAsync("api/chat/assistant",
            new { question = "Anything about goblin market widgets?", conversationId = id }, customer.AccessToken));
        persisted.Reply.ConversationId.Should().Be(id);
        persisted.Matches.Should().BeEmpty();

        var transcript = await MessagesAsync(customer.AccessToken, id);
        transcript.Select(m => m.Body).Should().ContainInOrder("hello", "Anything about goblin market widgets?");
        transcript[^1].AuthorKind.Should().Be("assistant");
        transcript[^2].AuthorKind.Should().Be("customer");

        // A conversation id the caller cannot see is ignored, never written to.
        var invisible = await ReadAsync<AssistantResponse>(await PostAsync("api/chat/assistant",
            new { question = "who are you", conversationId = id }, stranger.AccessToken));
        invisible.Reply.ConversationId.Should().Be(0);
        (await MessagesAsync(customer.AccessToken, id)).Should().HaveCount(transcript.Length,
            "the stranger's call must not add anything to somebody else's thread");
    }

    [Fact]
    public async Task The_assistant_reports_real_orders_and_never_leaks_another_customers_order()
    {
        var product = await SeedProductAsync("CHAT-02", 40.00m, stock: 5);
        var alice = await RegisterCustomerAsync("chat09-alice@example.com");
        var bob = await RegisterCustomerAsync("chat09-bob@example.com");

        var order = await ReadAsync<OrderDto>(await PlaceOrderAsync(alice.AccessToken, [(product.Id, 1)]));

        var own = await ReadAsync<AssistantResponse>(await PostAsync("api/chat/assistant",
            new { question = "Where is my order?" }, alice.AccessToken));
        var match = own.Matches.Should().ContainSingle().Subject;
        match.Kind.Should().Be("order");
        match.Id.Should().Be(order.Id);
        match.Link.Should().Be("/orders");
        own.Reply.Body.Should().Contain($"Order #{order.Id}").And.Contain("Pending");

        // Bob asks for Alice's order by its real reference: nothing about it may surface.
        var leaked = await ReadAsync<AssistantResponse>(await PostAsync("api/chat/assistant",
            new { question = $"Where is my order {order.Id}?" }, bob.AccessToken));
        leaked.Matches.Should().BeEmpty();
        leaked.Reply.Body.Should().NotContain($"#{order.Id}");
        leaked.Reply.Body.Should().NotContain("Pending");
        leaked.Reply.Body.Should().Contain("could not find");
    }

    // ------------------------------------------------------------------ round 31: public assistant + automated support replies

    private sealed record ConversationEnvelope(int Id, Msg? AutoReply);
    private sealed record PostEnvelope(Msg Message, Msg? AutoReply);

    private async Task SeedPolicyAsync(string key, string value) =>
        await Factory.QueryAsync(async db =>
        {
            db.Settings.Add(new Setting { Key = key, Value = value });
            await db.SaveChangesAsync();
            return true;
        });

    [Fact]
    public async Task A_guest_gets_the_assistant_without_an_account_and_never_touches_a_conversation()
    {
        var product = await SeedProductAsync("CHAT-11", 120.00m, stock: 3);
        var customer = await RegisterCustomerAsync("chat11@example.com");
        var id = await OpenChatAsync(customer.AccessToken, "unrelated question about nothing");

        var guest = await ReadAsync<AssistantResponse>(await PostAsync("api/chat/assistant",
            new { question = "Do you have the chat-11 product?" }));
        guest.Reply.AuthorKind.Should().Be("assistant");
        guest.Reply.AuthorName.Should().Be("NineCube Assistant");
        guest.Reply.ConversationId.Should().Be(0, "an anonymous caller never persists anything");
        guest.Matches.Should().ContainSingle(m => m.Id == product.Id);

        // An anonymous caller supplying a conversation id must not write into any thread.
        var anonymous = await ReadAsync<AssistantResponse>(await PostAsync("api/chat/assistant",
            new { question = "who are you", conversationId = id }));
        anonymous.Reply.ConversationId.Should().Be(0);
        (await Factory.QueryAsync(db => db.ChatMessages.CountAsync(m => m.ConversationId == id))).Should().Be(1,
            "only the customer's own opening message exists in the thread");
    }

    [Fact]
    public async Task A_new_support_chat_answers_common_questions_instantly_from_stored_policy_text()
    {
        var customer = await RegisterCustomerAsync("chat12@example.com", "Auto Customer");
        await SeedPolicyAsync(SettingKeys.PolicyDelivery,
            "Standard delivery is BDT 60 below a merchandise subtotal of BDT 2,500.");

        var opened = await PostAsync("api/chat/conversations",
            new { message = "Hi, do you deliver to Chattogram?" }, customer.AccessToken);
        var envelope = await ReadAsync<ConversationEnvelope>(opened);
        var auto = envelope.AutoReply;
        auto.Should().NotBeNull();
        auto!.AuthorKind.Should().Be("assistant");
        auto.AuthorName.Should().Be("NineCube Support");
        auto.Body.Should().Contain("From our delivery & shipping policy:");
        auto.Body.Should().Contain("Standard delivery is BDT 60");

        var transcript = await MessagesAsync(customer.AccessToken, envelope.Id);
        transcript.Select(m => m.AuthorKind).Should().Equal("customer", "assistant");
    }

    [Fact]
    public async Task The_automated_reply_goes_quiet_once_a_staff_member_has_written()
    {
        var customer = await RegisterCustomerAsync("chat13@example.com", "Auto Two");
        var (_, staffToken) = await SeedAndLoginAsync("chat13-staff@example.com", UserRole.Staff);
        var id = await OpenChatAsync(customer.AccessToken, "opening line about nothing");

        var before = await ReadAsync<PostEnvelope>(await PostAsync($"api/chat/conversations/{id}/messages",
            new { body = "Hello?" }, customer.AccessToken));
        before.AutoReply.Should().NotBeNull();
        before.AutoReply!.Body.Should().Contain("welcome to NineCube support");

        await PostAsync($"api/chat/conversations/{id}/messages", new { body = "We are looking into it." }, staffToken);

        var after = await ReadAsync<PostEnvelope>(await PostAsync($"api/chat/conversations/{id}/messages",
            new { body = "Hello again" }, customer.AccessToken));
        after.AutoReply.Should().BeNull("a human agent owns the thread now");
    }

    [Fact]
    public async Task A_question_outside_the_stores_own_knowledge_waits_for_a_human()
    {
        var customer = await RegisterCustomerAsync("chat14@example.com");

        var opened = await PostAsync("api/chat/conversations",
            new { message = "Can you recertify my grandmother's radio?" }, customer.AccessToken);
        var envelope = await ReadAsync<ConversationEnvelope>(opened);

        envelope.AutoReply.Should().BeNull("the responder only quotes the stored policies and the fixed greeting");
    }
}
