using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IInventoryService
{
    Task<ProductDto> CreateProductAsync(CreateProductRequest request, CancellationToken ct = default);
    Task<ProductDto> UpdateProductAsync(int id, UpdateProductRequest request, CancellationToken ct = default);
    Task<ProductDto> AdjustStockAsync(int productId, StockAdjustmentRequest request, CancellationToken ct = default);
    Task<PagedResult<InventoryMovementDto>> GetMovementsAsync(int? productId, int page, int pageSize, CancellationToken ct = default);
}

public sealed class InventoryService : IInventoryService
{
    private readonly IAppDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;
    private readonly ITransientErrorPolicy _errors;
    private readonly IBrandService _brands;
    private readonly IProductImageService _images;
    private readonly INotificationWriter _notifications;

    public InventoryService(
        IAppDbContext db,
        ICurrentUser currentUser,
        IClock clock,
        ITransientErrorPolicy errors,
        IBrandService brands,
        IProductImageService images,
        INotificationWriter notifications)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
        _errors = errors;
        _brands = brands;
        _images = images;
        _notifications = notifications;
    }

    public async Task<ProductDto> CreateProductAsync(CreateProductRequest request, CancellationToken ct = default)
    {
        var sku = request.Sku.Trim();
        var exists = await _db.Products.AnyAsync(p => p.Sku == sku, ct);
        if (exists) throw new ResourceConflictException("A product with this SKU already exists.", "duplicate_sku");

        var (brandId, productLineId) = await _brands.ResolveAsync(request.BrandId, request.ProductLineId, ct);

        var now = _clock.UtcNow;
        var product = new Product
        {
            Sku = sku,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            ImageUrl = request.ImageUrl?.Trim(),
            BrandId = brandId,
            ProductLineId = productLineId,
            Price = decimal.Round(request.Price, 2, MidpointRounding.AwayFromZero),
            CompareAtPrice = request.CompareAtPrice.HasValue ? decimal.Round(request.CompareAtPrice.Value, 2, MidpointRounding.AwayFromZero) : null,
            StockQuantity = 0,
            IsActive = request.IsActive,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Products.Add(product);
        await _db.SaveChangesAsync(ct);
        await _images.SyncFromProductUrlAsync(product.Id, product.ImageUrl, ct);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = AuditActions.ProductCreated,
            EntityType = nameof(Product),
            EntityId = product.Id.ToString(),
            CreatedAt = now,
            Details = $"sku={product.Sku}; price={product.Price:0.00}"
        });
        await _db.SaveChangesAsync(ct);

        return await LoadAsync(product.Id, ct);
    }

    public async Task<ProductDto> UpdateProductAsync(int id, UpdateProductRequest request, CancellationToken ct = default)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new NotFoundException($"Product {id} was not found.");

        var before = $"{product.Name}|{product.Price:0.00}|{product.IsActive}";
        var (brandId, productLineId) = await _brands.ResolveAsync(request.BrandId, request.ProductLineId, ct);

        product.Name = request.Name.Trim();
        product.Price = decimal.Round(request.Price, 2, MidpointRounding.AwayFromZero);
        product.CompareAtPrice = request.CompareAtPrice.HasValue ? decimal.Round(request.CompareAtPrice.Value, 2, MidpointRounding.AwayFromZero) : null;
        product.IsActive = request.IsActive;
        product.Description = request.Description?.Trim();
        product.ImageUrl = request.ImageUrl?.Trim();
        product.BrandId = brandId;
        product.ProductLineId = productLineId;
        product.UpdatedAt = _clock.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _images.SyncFromProductUrlAsync(product.Id, product.ImageUrl, ct);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = AuditActions.ProductUpdated,
            EntityType = nameof(Product),
            EntityId = product.Id.ToString(),
            CreatedAt = _clock.UtcNow,
            Details = $"from={before}; to={product.Name}|{product.Price:0.00}|{product.IsActive}"
        });
        await _db.SaveChangesAsync(ct);

        return await LoadAsync(product.Id, ct);
    }

    /// <summary>
    /// Stock adjustments use the exact same atomic pattern as order placement:
    /// <c>UPDATE Products SET StockQuantity = StockQuantity + @delta WHERE Id = @id AND StockQuantity + @delta &gt;= 0</c>.
    /// The guard is inside the WHERE clause, so there is no window between checking and writing,
    /// and a concurrent order reservation can never be silently overwritten.
    /// </summary>
    public Task<ProductDto> AdjustStockAsync(int productId, StockAdjustmentRequest request, CancellationToken ct = default)
        => _errors.ExecuteWithRetryAsync(async () =>
        {
            var delta = request.Delta;
            if (delta == 0)
                throw new BusinessValidationException("Delta must be a non-zero signed integer.");

            var reason = request.Reason?.Trim() ?? string.Empty;
            if (reason.Length == 0)
                throw new BusinessValidationException("A reason is mandatory for every stock adjustment.");

            await using var tx = await _db.Database.BeginTransactionAsync(ct);

            var affected = await _db.Products
                .Where(p => p.Id == productId && p.StockQuantity + delta >= 0)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + delta), ct);

            if (affected == 0)
            {
                var exists = await _db.Products.AnyAsync(p => p.Id == productId, ct);
                throw exists
                    ? new StockAdjustmentConflictException(
                        $"Adjustment of {delta} would take product {productId} below zero stock.")
                    : new NotFoundException($"Product {productId} was not found.");
            }

            var now = _clock.UtcNow;
            _db.InventoryMovements.Add(new InventoryMovement
            {
                ProductId = productId,
                OrderId = null,
                Delta = delta,
                Reason = reason,
                CreatedByUserId = _currentUser.UserId,
                CreatedAt = now
            });

            _db.AuditLogs.Add(new AuditLog
            {
                UserId = _currentUser.UserId,
                Action = AuditActions.StockAdjusted,
                EntityType = nameof(Product),
                EntityId = productId.ToString(),
                CreatedAt = now,
                Details = $"delta={delta}; reason={reason}"
            });

            if (delta < 0) await _notifications.QueueLowStockAsync(productId, ct);

            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);

            return await LoadAsync(productId, ct);
        });

    public async Task<PagedResult<InventoryMovementDto>> GetMovementsAsync(int? productId, int page, int pageSize, CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 200 ? 50 : pageSize;

        var query = _db.InventoryMovements.AsNoTracking();
        if (productId is not null) query = query.Where(m => m.ProductId == productId);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new InventoryMovementDto(
                m.Id,
                m.ProductId,
                m.OrderId,
                m.Delta,
                m.Reason,
                m.CreatedByUserId,
                m.CreatedByUserId == null
                    ? null
                    : _db.Users.Where(u => u.Id == m.CreatedByUserId).Select(u => u.Email).FirstOrDefault(),
                m.CreatedAt))
            .ToListAsync(ct);

        return new PagedResult<InventoryMovementDto>(items, page, pageSize, total);
    }

    private async Task<ProductDto> LoadAsync(int id, CancellationToken ct)
    {
        var product = await _db.Products.AsNoTracking()
            .Where(p => p.Id == id)
            .Select(CatalogService.Projection)
            .FirstOrDefaultAsync(ct);

        return product ?? throw new NotFoundException($"Product {id} was not found.");
    }
}
