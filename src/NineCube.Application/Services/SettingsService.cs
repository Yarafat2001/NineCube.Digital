using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>
/// The low stock threshold is a business value, not a code constant, so it lives in the
/// Setting table and is editable by the Administrator at runtime.
/// </summary>
public sealed class SettingsService : ISettingsService
{
    public const int DefaultLowStockThreshold = 5;

    private readonly IAppDbContext _db;

    public SettingsService(IAppDbContext db) => _db = db;

    public async Task<int> GetLowStockThresholdAsync(CancellationToken ct = default)
    {
        var raw = await _db.Settings.AsNoTracking()
            .Where(s => s.Key == SettingKeys.LowStockThreshold)
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);

        return int.TryParse(raw, out var value) && value >= 0 ? value : DefaultLowStockThreshold;
    }

    public async Task SetLowStockThresholdAsync(int value, CancellationToken ct = default)
    {
        if (value < 0 || value > 10_000)
            throw new BusinessValidationException("Low stock threshold must be between 0 and 10000.");

        var setting = await _db.Settings.FirstOrDefaultAsync(s => s.Key == SettingKeys.LowStockThreshold, ct);
        if (setting is null)
        {
            _db.Settings.Add(new Setting { Key = SettingKeys.LowStockThreshold, Value = value.ToString() });
        }
        else
        {
            setting.Value = value.ToString();
        }

        await _db.SaveChangesAsync(ct);
    }
}
