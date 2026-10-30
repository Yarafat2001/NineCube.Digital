using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IWishlistService
{
    Task<IReadOnlyList<WishlistItemDto>> GetWishlistAsync(CancellationToken ct = default);
    Task<bool> ToggleWishlistAsync(int productId, CancellationToken ct = default);
}

public sealed class WishlistService : IWishlistService
{
    private readonly IAppDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;

    public WishlistService(
        IAppDbContext db,
        ICurrentUser currentUser,
        IClock clock)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<IReadOnlyList<WishlistItemDto>> GetWishlistAsync(CancellationToken ct = default)
    {
        if (_currentUser.CustomerId is not int customerId)
        {
            throw new ForbiddenException("Only customer accounts have a wishlist.");
        }

        var items = await _db.WishlistItems.AsNoTracking()
            .Where(w => w.CustomerId == customerId)
            .OrderByDescending(w => w.CreatedAt)
            .Select(w => new WishlistItemDto(
                w.Id,
                w.ProductId,
                w.Product!.Name,
                w.Product.Sku,
                w.Product.Price,
                w.Product.ImageUrl,
                w.Product.IsActive && w.Product.StockQuantity > 0,
                w.CreatedAt))
            .ToListAsync(ct);

        return items;
    }

    public async Task<bool> ToggleWishlistAsync(int productId, CancellationToken ct = default)
    {
        if (_currentUser.CustomerId is not int customerId)
        {
            throw new ForbiddenException("Only customer accounts have a wishlist.");
        }

        if (!await _db.Products.AnyAsync(p => p.Id == productId, ct))
        {
            throw new NotFoundException($"Product {productId} was not found.");
        }

        var existing = await _db.WishlistItems
            .FirstOrDefaultAsync(w => w.CustomerId == customerId && w.ProductId == productId, ct);

        if (existing is not null)
        {
            _db.WishlistItems.Remove(existing);
            await _db.SaveChangesAsync(ct);
            return false; // Removed
        }

        _db.WishlistItems.Add(new WishlistItem
        {
            CustomerId = customerId,
            ProductId = productId,
            CreatedAt = _clock.UtcNow
        });

        await _db.SaveChangesAsync(ct);
        return true; // Added
    }
}
