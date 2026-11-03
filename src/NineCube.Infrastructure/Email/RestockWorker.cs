using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NineCube.Application.Abstractions;

namespace NineCube.Infrastructure.Email;

/// <summary>Durable at-least-once restock delivery with per-row leases and retry after failures.</summary>
public sealed class RestockWorker(IServiceScopeFactory scopes, IConfiguration config, ILogger<RestockWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            if (string.IsNullOrWhiteSpace(config["Email:Smtp:Host"])) continue;
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var clock = scope.ServiceProvider.GetRequiredService<IClock>();
                var sender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
                var now = clock.UtcNow;
                var pending = await db.RestockSubscriptions.AsNoTracking().Include(s => s.Product).Include(s => s.User)
                    .Where(s => s.SentAt == null && (s.LeaseUntil == null || s.LeaseUntil < now)
                        && s.Product.IsActive && s.Product.StockQuantity > 0 && s.User.IsActive)
                    .OrderBy(s => s.Id).Take(20).ToListAsync(stoppingToken);
                foreach (var subscription in pending)
                {
                    var claimed = await db.RestockSubscriptions.Where(s => s.Id == subscription.Id && s.SentAt == null
                        && (s.LeaseUntil == null || s.LeaseUntil < now))
                        .ExecuteUpdateAsync(s => s.SetProperty(x => x.LeaseUntil, now.AddMinutes(5)), stoppingToken);
                    if (claimed != 1) continue;
                    try
                    {
                        await sender.SendEmailAsync(subscription.User.Email, "Your NineCube restock alert",
                            $"<p>{WebUtility.HtmlEncode(subscription.Product.Name)} is back in stock. Availability may change before checkout.</p>", stoppingToken);
                        await db.RestockSubscriptions.Where(s => s.Id == subscription.Id)
                            .ExecuteUpdateAsync(s => s.SetProperty(x => x.SentAt, clock.UtcNow), stoppingToken);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        logger.LogWarning("Restock delivery failed for subscription {Id}; retry scheduled.", subscription.Id);
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("Restock worker could not complete its batch ({ErrorType}).", ex.GetType().Name);
            }
        }
    }
}
