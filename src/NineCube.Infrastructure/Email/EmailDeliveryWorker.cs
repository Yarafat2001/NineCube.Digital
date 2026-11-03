using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NineCube.Application.Abstractions;

namespace NineCube.Infrastructure.Email;

public sealed class EmailDeliveryWorker(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<EmailDeliveryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            if (string.IsNullOrWhiteSpace(configuration["Email:Smtp:Host"])) continue;
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var clock = scope.ServiceProvider.GetRequiredService<IClock>();
                var sender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
                var now = clock.UtcNow;
                var batch = await db.EmailDeliveries.AsNoTracking().Where(m => m.SentAt == null && (m.LeaseUntil == null || m.LeaseUntil < now))
                    .OrderBy(m => m.Id).Take(20).ToListAsync(stoppingToken);
                foreach (var message in batch)
                {
                    var claimed = await db.EmailDeliveries.Where(m => m.Id == message.Id && m.SentAt == null && (m.LeaseUntil == null || m.LeaseUntil < now))
                        .ExecuteUpdateAsync(s => s.SetProperty(m => m.LeaseUntil, now.AddMinutes(5)).SetProperty(m => m.Attempts, m => m.Attempts + 1), stoppingToken);
                    if (claimed != 1) continue;
                    try
                    {
                        await sender.SendEmailAsync(message.Recipient, message.Subject, message.Body, stoppingToken);
                        await db.EmailDeliveries.Where(m => m.Id == message.Id).ExecuteUpdateAsync(s => s.SetProperty(m => m.SentAt, clock.UtcNow), stoppingToken);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        logger.LogWarning("Email delivery {Id} failed; it remains queued for retry.", message.Id);
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("Email queue could not complete its batch ({ErrorType}).", ex.GetType().Name);
            }
        }
    }
}
