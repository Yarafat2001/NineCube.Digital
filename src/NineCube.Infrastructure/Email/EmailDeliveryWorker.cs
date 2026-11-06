using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NineCube.Application.Abstractions;

namespace NineCube.Infrastructure.Email;

public sealed class EmailDeliveryWorker(IServiceScopeFactory scopes, ILogger<EmailDeliveryWorker> logger) : BackgroundService
{
    // A lease that never expires. Not DateTime.MaxValue: Npgsql writes 7 fractional digits and
    // PostgreSQL rounds them to microseconds, which would push MaxValue past the timestamptz range.
    public static readonly DateTime DeadLetterLease = DateTime.SpecifyKind(new DateTime(9999, 12, 31, 23, 59, 59), DateTimeKind.Utc);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("Email queue could not complete its batch ({ErrorType}).", ex.GetType().Name);
            }
        }
    }

    /// <summary>
    /// Claims and sends one batch of due deliveries. Extracted so tests can drive single
    /// batches against a scripted sender. The lease written at claim time is the backoff
    /// delay, so a failed row is invisible to every instance until its next attempt is due.
    /// </summary>
    public async Task ProcessBatchAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        // Preserve the queue while SMTP is being configured; do not exhaust retries.
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        if (string.IsNullOrWhiteSpace(config["Email:Smtp:Host"])) return;

        var options = scope.ServiceProvider.GetRequiredService<IOptions<EmailWorkerOptions>>().Value;
        var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();
        var sender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        var now = clock.UtcNow;

        var batch = await db.EmailDeliveries.AsNoTracking()
            .Where(m => m.SentAt == null && m.Attempts < options.MaxAttempts && (m.LeaseUntil == null || m.LeaseUntil < now))
            .OrderBy(m => m.Id).Take(20).ToListAsync(ct);

        foreach (var message in batch)
        {
            var attempts = message.Attempts + 1;
            var leaseUntil = now.AddMinutes(options.BackoffForAttempt(attempts));
            var claimed = await db.EmailDeliveries.Where(m => m.Id == message.Id && m.SentAt == null && (m.LeaseUntil == null || m.LeaseUntil < now))
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.LeaseUntil, leaseUntil).SetProperty(m => m.Attempts, attempts), ct);
            if (claimed != 1) continue;

            try
            {
                await sender.SendEmailAsync(message.Recipient, message.Subject, message.Body, ct);
                await db.EmailDeliveries.Where(m => m.Id == message.Id)
                    .ExecuteUpdateAsync(s => s.SetProperty(m => m.SentAt, clock.UtcNow).SetProperty(m => m.LeaseUntil, (DateTime?)null).SetProperty(m => m.LastError, (string?)null), ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (attempts >= options.MaxAttempts)
                {
                    logger.LogError(ex, "Email delivery {Id} exceeded maximum attempts ({MaxAttempts}); moved to dead-letter state.",
                        message.Id, options.MaxAttempts);
                    var error = ex.Message.Length > 1000 ? ex.Message[..1000] : ex.Message;
                    await db.EmailDeliveries.Where(m => m.Id == message.Id)
                        .ExecuteUpdateAsync(s => s.SetProperty(m => m.LeaseUntil, DeadLetterLease)
                            .SetProperty(m => m.LastError, error)
                            .SetProperty(m => m.FailedAt, clock.UtcNow), ct);
                }
                else
                {
                    logger.LogWarning(ex, "Email delivery {Id} failed; attempt {Attempt}/{MaxAttempts} scheduled for retry.",
                        message.Id, attempts, options.MaxAttempts);
                }
            }
        }
    }
}
