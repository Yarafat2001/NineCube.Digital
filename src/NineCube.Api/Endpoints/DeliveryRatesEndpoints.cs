using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed class DeliveryRatesEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/delivery/rates", async (IAppDbContext db, CancellationToken ct) => Results.Ok(await DeliveryRates.ReadAsync(db, ct))).AllowAnonymous();
        app.MapPut("/api/delivery/rates", async (List<DeliveryRate> rates, IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            if (rates.Count is < 1 or > 200 || rates.Any(r => AddressCountries.Find(r.CountryCode) is null || r.CountryCode != r.CountryCode.ToUpperInvariant()
                || r.Currency is not ("BDT" or "USD") || r.Division?.Length > 80 || r.District?.Length > 80
                || r.Fee is < 0 or > 100000 || r.FreeAbove < 0 || r.MinDays < 0 || r.MaxDays < r.MinDays || r.MaxDays > 365
                || r.MinDays.HasValue != r.MaxDays.HasValue || decimal.Round(r.Fee, 2) != r.Fee)
                || rates.GroupBy(r => new { r.CountryCode, r.Division, r.District, r.Currency }).Any(g => g.Count() > 1))
                throw new BusinessValidationException("Provide distinct destinations, valid fees, optional free-shipping thresholds, and complete delivery-day ranges.");
            var setting = await db.Settings.SingleOrDefaultAsync(s => s.Key == "commerce.delivery-rates", ct);
            if (setting is null) { setting = new Setting { Key = "commerce.delivery-rates" }; db.Settings.Add(setting); }
            setting.Value = JsonSerializer.Serialize(rates);
            db.AuditLogs.Add(new AuditLog { Action = "delivery.rates_updated", EntityType = "Setting", EntityId = setting.Key, UserId = caller.UserId, CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); return Results.NoContent();
        }).RequireAuthorization(Policies.AdministratorOnly);
    }
}
