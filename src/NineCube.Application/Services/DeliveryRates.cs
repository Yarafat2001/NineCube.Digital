using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Application.Services;

public sealed record DeliveryRate(string CountryCode, string? Division, string? District, string Currency, decimal Fee,
    decimal? FreeAbove, int? MinDays, int? MaxDays);
public sealed record DeliveryEstimate(decimal Fee, decimal? FreeAbove, int? MinDays, int? MaxDays);
public static class DeliveryRates
{
    public static async Task<IReadOnlyList<DeliveryRate>> ReadAsync(IAppDbContext db, CancellationToken ct)
    {
        var setting = await db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == "commerce.delivery-rates", ct);
        return setting is null ? [new("BD", null, null, "BDT", 60, 2500, null, null)] : JsonSerializer.Deserialize<List<DeliveryRate>>(setting.Value)!;
    }
    public static async Task<DeliveryEstimate> ResolveAsync(IAppDbContext db, string country, string? division, string? district, string currency, decimal subtotal, CancellationToken ct)
    {
        var rates = await ReadAsync(db, ct);
        var rate = rates.Where(r => r.CountryCode == country && r.Currency == currency
            && (string.IsNullOrWhiteSpace(r.Division) || string.Equals(r.Division, division, StringComparison.OrdinalIgnoreCase))
            && (string.IsNullOrWhiteSpace(r.District) || string.Equals(r.District, district, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(r => !string.IsNullOrWhiteSpace(r.District)).ThenByDescending(r => !string.IsNullOrWhiteSpace(r.Division)).FirstOrDefault();
        if (rate is null) throw new BusinessValidationException("Delivery is unavailable for this destination and currency. Choose another address or contact support.");
        return new(rate.FreeAbove.HasValue && subtotal >= rate.FreeAbove.Value ? 0 : rate.Fee, rate.FreeAbove, rate.MinDays, rate.MaxDays);
    }
}
