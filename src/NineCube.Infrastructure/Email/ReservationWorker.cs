using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NineCube.Application.Services;

namespace NineCube.Infrastructure.Email;

public sealed class ReservationWorker(IServiceScopeFactory scopes, ILogger<ReservationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<IOrderService>().ExpireReservationsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("Reservation expiration batch failed ({ErrorType}); it will retry.", ex.GetType().Name);
            }
        }
    }
}
