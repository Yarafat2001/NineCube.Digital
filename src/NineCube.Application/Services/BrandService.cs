using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IBrandService
{
    /// <summary>
    /// Validates a brand/series pair against the catalogue. A series always carries its brand, so a pair
    /// from two different brands can never describe one product and is rejected as a conflict.
    /// </summary>
    Task<(int? BrandId, int? ProductLineId)> ResolveAsync(int? brandId, int? productLineId, CancellationToken ct = default);
}

public sealed class BrandService(IAppDbContext db) : IBrandService
{
    public async Task<(int? BrandId, int? ProductLineId)> ResolveAsync(int? brandId, int? productLineId, CancellationToken ct = default)
    {
        if (productLineId is null)
        {
            if (brandId is int id && !await db.Brands.AnyAsync(b => b.Id == id, ct))
                throw new NotFoundException("This brand is unavailable.");
            return (brandId, null);
        }

        var line = await db.ProductLines.AsNoTracking()
            .FirstOrDefaultAsync(l => l.Id == productLineId, ct)
            ?? throw new NotFoundException("This series is unavailable.");

        if (brandId is not null && brandId != line.BrandId)
            throw new ResourceConflictException(
                $"The series {line.Name} belongs to {line.Brand?.Name ?? "another brand"}, not to the brand in this request.",
                "brand_line_mismatch");

        return (line.BrandId, line.Id);
    }
}
