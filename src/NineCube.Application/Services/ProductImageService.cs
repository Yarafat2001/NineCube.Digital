using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>
/// A media file that passed validation: jpeg, png or webp, at most five megabytes. The extension comes
/// from the file signature, never from the client-supplied name.
/// </summary>
public sealed record ProductImageUpload(string? ContentType, long Length, byte[] Header)
{
    public const long MaxBytes = 5 * 1024 * 1024;

    public static bool TryGetExtension(long length, byte[] header, out string extension)
    {
        extension = string.Empty;
        if (length is <= 0 or > MaxBytes || header.Length < 12) return false;

        if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF) { extension = "jpg"; return true; }
        if (header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47 &&
            header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A) { extension = "png"; return true; }
        if (header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F' &&
            header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P') { extension = "webp"; return true; }

        return false;
    }
}

public interface IProductImageService
{
    Task<ProductImageDto> UploadAsync(int productId, Stream content, CancellationToken ct = default);
    Task<ProductDto> SetPrimaryAsync(int productId, int imageId, CancellationToken ct = default);
    Task<ProductDto> DeleteAsync(int productId, int imageId, CancellationToken ct = default);

    /// <summary>Keeps the gallery in step with the Product.ImageUrl field edited on the Inventory form.</summary>
    Task SyncFromProductUrlAsync(int productId, string? imageUrl, CancellationToken ct = default);
}

/// <summary>
/// Product media. Files are stored through <see cref="IProductStorage"/> and referenced by a public url.
/// The gallery is the set of ProductImage rows; exactly one of them is primary, and its url is mirrored on
/// Product.ImageUrl so cards, the detail page and older clients all read the same picture.
/// </summary>
public sealed class ProductImageService(
    IAppDbContext db,
    IProductStorage storage,
    IClock clock,
    IAuditWriter audit) : IProductImageService
{
    public async Task<ProductImageDto> UploadAsync(int productId, Stream content, CancellationToken ct = default)
    {
        if (!content.CanSeek) throw new BusinessValidationException("Product image uploads must be seekable.");

        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId, ct)
            ?? throw new NotFoundException($"Product {productId} was not found.");

        // A truncated upload is a bad request, not an IO failure, so read the header without
        // requiring the full 12 bytes.
        var header = new byte[12];
        var filled = 0;
        while (filled < header.Length)
        {
            var read = await content.ReadAsync(header.AsMemory(filled, header.Length - filled), ct);
            if (read == 0) break;
            filled += read;
        }

        if (!ProductImageUpload.TryGetExtension(content.Length, header, out var extension))
            throw new BusinessValidationException("Product images must be JPG, PNG or WebP files of at most 5 MB.");

        content.Position = 0;
        var url = await storage.StoreAsync(content, extension, ct);

        var position = await db.ProductImages.CountAsync(i => i.ProductId == productId, ct);
        var image = new ProductImage
        {
            ProductId = productId,
            Url = url,
            StoragePath = url,
            IsPrimary = position == 0,
            SortOrder = position,
            AltText = product.Name.Length <= 120 ? product.Name : product.Name[..120],
            CreatedAt = clock.UtcNow
        };

        db.ProductImages.Add(image);
        if (image.IsPrimary)
        {
            product.ImageUrl = url;
            product.UpdatedAt = clock.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync(AuditActions.ProductImageUploaded, nameof(Product), productId.ToString(), $"url={url}; primary={image.IsPrimary}", ct);

        return new ProductImageDto(image.Id, image.Url, image.IsPrimary, image.AltText);
    }

    public async Task<ProductDto> SetPrimaryAsync(int productId, int imageId, CancellationToken ct = default)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId, ct)
            ?? throw new NotFoundException($"Product {productId} was not found.");
        var images = await db.ProductImages.Where(i => i.ProductId == productId).ToListAsync(ct);
        var target = images.FirstOrDefault(i => i.Id == imageId)
            ?? throw new NotFoundException($"Image {imageId} was not found for product {productId}.");

        foreach (var image in images) image.IsPrimary = image.Id == target.Id;
        product.ImageUrl = target.Url;
        product.UpdatedAt = clock.UtcNow;

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync(AuditActions.ProductImagePromoted, nameof(Product), productId.ToString(), $"imageId={imageId}", ct);

        return await LoadAsync(productId, ct);
    }

    public async Task<ProductDto> DeleteAsync(int productId, int imageId, CancellationToken ct = default)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId, ct)
            ?? throw new NotFoundException($"Product {productId} was not found.");
        var images = await db.ProductImages.Where(i => i.ProductId == productId)
            .OrderBy(i => i.SortOrder).ThenBy(i => i.Id).ToListAsync(ct);
        var target = images.FirstOrDefault(i => i.Id == imageId)
            ?? throw new NotFoundException($"Image {imageId} was not found for product {productId}.");

        var wasPrimary = target.IsPrimary;
        db.ProductImages.Remove(target);
        await db.SaveChangesAsync(ct);
        await storage.DeleteAsync(target.StoragePath, ct);

        if (wasPrimary)
        {
            var remaining = await db.ProductImages.Where(i => i.ProductId == productId)
                .OrderBy(i => i.SortOrder).ThenBy(i => i.Id).ToListAsync(ct);
            var next = remaining.FirstOrDefault();
            if (next is not null)
            {
                next.IsPrimary = true;
                product.ImageUrl = next.Url;
            }
            else
            {
                product.ImageUrl = null;
            }

            product.UpdatedAt = clock.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        await audit.WriteAsync(AuditActions.ProductImageDeleted, nameof(Product), productId.ToString(), $"imageId={imageId}; url={target.Url}", ct);
        return await LoadAsync(productId, ct);
    }

    public async Task SyncFromProductUrlAsync(int productId, string? imageUrl, CancellationToken ct = default)
    {
        var url = imageUrl?.Trim();
        var images = await db.ProductImages.Where(i => i.ProductId == productId).ToListAsync(ct);

        if (string.IsNullOrWhiteSpace(url))
        {
            // Clearing the image field means "this product has no media": the rows and their stored files
            // go with it, so every product that still has images keeps exactly one primary.
            if (images.Count == 0) return;
            db.ProductImages.RemoveRange(images);
            await db.SaveChangesAsync(ct);
            foreach (var image in images) await storage.DeleteAsync(image.StoragePath, ct);
            return;
        }

        var match = images.FirstOrDefault(i => i.Url == url);
        if (match is null)
        {
            match = new ProductImage
            {
                ProductId = productId,
                Url = url,
                StoragePath = url.StartsWith(storage.PublicPrefix + "/", StringComparison.OrdinalIgnoreCase) ? url : null,
                IsPrimary = images.Count == 0,
                SortOrder = images.Count,
                CreatedAt = clock.UtcNow
            };
            db.ProductImages.Add(match);
        }
        else if (!match.IsPrimary)
        {
            foreach (var image in images) image.IsPrimary = image.Id == match.Id;
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task<ProductDto> LoadAsync(int productId, CancellationToken ct) =>
        await db.Products.AsNoTracking().Where(p => p.Id == productId).Select(CatalogService.Projection).SingleAsync(ct);
}
