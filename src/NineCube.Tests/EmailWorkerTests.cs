using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NineCube.Domain;
using NineCube.Infrastructure.Email;
using NineCube.Infrastructure.Persistence;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// The email outbox end to end: the worker's claim/backoff/dead-letter behaviour against the
/// real PostgreSQL database, and the operations endpoint an administrator uses to inspect and
/// requeue failed deliveries. The SMTP layer is a scripted fake; everything else is production.
/// </summary>
public sealed class EmailWorkerTests(ApiFactory factory) : ApiTestBase(factory)
{
    private FakeEmailSender Sender => Factory.Services.GetRequiredService<FakeEmailSender>();
    private EmailDeliveryWorker Worker => Factory.Services.GetRequiredService<EmailDeliveryWorker>();

    private async Task<int> QueueAsync(string recipient = "buyer@ninecube.demo", string subject = "Order receipt")
    {
        return await Factory.WithDbAsync(async db =>
        {
            var delivery = new EmailDelivery
            {
                Key = Guid.NewGuid().ToString("N"),
                Recipient = recipient,
                Subject = subject,
                Body = "<p>Body</p>",
                CreatedAt = DateTime.UtcNow
            };
            db.EmailDeliveries.Add(delivery);
            await db.SaveChangesAsync();
            return delivery.Id;
        });
    }

    private async Task<EmailDelivery> GetAsync(int id) =>
        await Factory.WithDbAsync(db => db.EmailDeliveries.AsNoTracking().SingleAsync(m => m.Id == id));

    private Task ExpireLeaseAsync(int id) =>
        Factory.WithDbAsync(db => db.EmailDeliveries.Where(m => m.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.LeaseUntil, (DateTime?)null)));

    [Fact]
    public async Task Delivers_due_email_and_marks_it_sent()
    {
        Sender.Succeed();
        var id = await QueueAsync();

        await Worker.ProcessBatchAsync(CancellationToken.None);

        var row = await GetAsync(id);
        row.SentAt.Should().NotBeNull();
        row.LeaseUntil.Should().BeNull();
        row.Attempts.Should().Be(1);
        row.LastError.Should().BeNull();
        row.FailedAt.Should().BeNull();
        Sender.Sent.Should().ContainSingle(s => s.Recipient == "buyer@ninecube.demo");
    }

    [Fact]
    public async Task Backs_off_between_failures_then_dead_letters_on_the_last_attempt()
    {
        Sender.FailWith(new InvalidOperationException("SMTP refused connection"));
        var id = await QueueAsync();
        var expectedBackoff = new[] { 1, 5, 15, 60 };

        for (var i = 0; i < expectedBackoff.Length; i++)
        {
            await Worker.ProcessBatchAsync(CancellationToken.None);

            var row = await GetAsync(id);
            row.Attempts.Should().Be(i + 1);
            row.SentAt.Should().BeNull();
            row.LeaseUntil.Should().NotBeNull();
            (row.LeaseUntil!.Value - DateTime.UtcNow).Should()
                .BeCloseTo(TimeSpan.FromMinutes(expectedBackoff[i]), TimeSpan.FromSeconds(10));
            row.LastError.Should().BeNull("a non-final failure keeps the row in the retry queue");
            row.FailedAt.Should().BeNull();

            await ExpireLeaseAsync(id);
        }

        // The 5th attempt exhausts the retry budget: dead-letter with the failure details.
        await Worker.ProcessBatchAsync(CancellationToken.None);

        var dead = await GetAsync(id);
        dead.Attempts.Should().Be(5);
        dead.SentAt.Should().BeNull();
        dead.LeaseUntil.Should().Be(EmailDeliveryWorker.DeadLetterLease);
        dead.LastError.Should().Be("SMTP refused connection");
        dead.FailedAt.Should().NotBeNull();

        // A dead-lettered row is invisible to the queue: another batch must not touch it.
        var calls = Sender.SendCalls;
        await Worker.ProcessBatchAsync(CancellationToken.None);
        (await GetAsync(id)).Attempts.Should().Be(5);
        Sender.SendCalls.Should().Be(calls);
    }

    [Fact]
    public async Task Requeue_resets_a_failed_delivery_and_it_is_delivered()
    {
        var id = await Factory.WithDbAsync(async db =>
        {
            var delivery = new EmailDelivery
            {
                Key = Guid.NewGuid().ToString("N"),
                Recipient = "buyer@ninecube.demo",
                Subject = "Gift card",
                Body = "<p>Body</p>",
                CreatedAt = DateTime.UtcNow,
                Attempts = 5,
                LeaseUntil = EmailDeliveryWorker.DeadLetterLease,
                LastError = "smtp down",
                FailedAt = DateTime.UtcNow
            };
            db.EmailDeliveries.Add(delivery);
            await db.SaveChangesAsync();
            return delivery.Id;
        });

        var (_, adminToken) = await SeedAndLoginAsync("email-ops-admin@ninecube.demo", UserRole.Administrator);
        var response = await PostAsync($"api/operations/email/{id}/retry", null, adminToken);
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var reset = await GetAsync(id);
        reset.Attempts.Should().Be(0);
        reset.LeaseUntil.Should().BeNull();
        reset.LastError.Should().BeNull();
        reset.FailedAt.Should().BeNull();

        Sender.Succeed();
        await Worker.ProcessBatchAsync(CancellationToken.None);

        var delivered = await GetAsync(id);
        delivered.SentAt.Should().NotBeNull();
        delivered.Attempts.Should().Be(1);
    }

    [Fact]
    public async Task Requeue_rejects_a_delivery_that_has_not_failed()
    {
        var id = await QueueAsync();
        var (_, adminToken) = await SeedAndLoginAsync("email-ops-admin-2@ninecube.demo", UserRole.Administrator);

        var response = await PostAsync($"api/operations/email/{id}/retry", null, adminToken);
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Failed_list_exposes_error_details_for_operators()
    {
        var id = await Factory.WithDbAsync(async db =>
        {
            var delivery = new EmailDelivery
            {
                Key = Guid.NewGuid().ToString("N"),
                Recipient = "buyer@ninecube.demo",
                Subject = "Password reset",
                Body = "<p>Body</p>",
                CreatedAt = DateTime.UtcNow,
                Attempts = 5,
                LeaseUntil = EmailDeliveryWorker.DeadLetterLease,
                LastError = "connection timed out",
                FailedAt = DateTime.UtcNow
            };
            db.EmailDeliveries.Add(delivery);
            await db.SaveChangesAsync();
            return delivery.Id;
        });

        var (_, adminToken) = await SeedAndLoginAsync("email-ops-admin-3@ninecube.demo", UserRole.Administrator);
        var response = await GetAsync("api/operations/email/", adminToken);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var json = await ReadJsonAsync(response);
        json.GetProperty("maxAttempts").GetInt32().Should().Be(5);
        var failed = json.GetProperty("failed");
        failed.GetArrayLength().Should().Be(1);
        failed[0].GetProperty("id").GetInt32().Should().Be(id);
        failed[0].GetProperty("lastError").GetString().Should().Be("connection timed out");
        failed[0].GetProperty("failedAt").ValueKind.Should().Be(JsonValueKind.String);
    }

    [Fact]
    public async Task Customer_cannot_access_email_operations()
    {
        var (_, customerToken) = await SeedAndLoginAsync("buyer@ninecube.demo", UserRole.Customer);

        var response = await GetAsync("api/operations/email/", customerToken);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
