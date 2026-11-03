using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record VariantRequest(string Sku, string Label, decimal Price, int InitialStock);
public sealed class ProductVariantEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/products/{id:int}/variants", async (int id, IAppDbContext db, ICurrentUser caller, CancellationToken ct) =>
        {
            var staff = caller.IsInRole(UserRole.Administrator, UserRole.InventoryManager, UserRole.Staff);
            var selected = await db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id && (staff || p.IsActive), ct) ?? throw new NotFoundException("Product was not found.");
            var parent = selected.ParentProductId ?? selected.Id;
            var options = await db.Products.AsNoTracking().Where(p => p.ParentProductId == parent && (staff || p.IsActive))
                .OrderBy(p => p.VariantLabel).Select(p => new { p.Id, label = p.VariantLabel, p.Price, p.Currency, p.StockQuantity, p.ImageUrl }).ToListAsync(ct);
            return Results.Ok(new { parentId = parent, options });
        }).AllowAnonymous();
        app.MapPost("/api/products/{id:int}/variants", async (int id, VariantRequest request, IAppDbContext db, IInventoryService inventory, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Sku) || request.Sku.Length > 64 || string.IsNullOrWhiteSpace(request.Label) || request.Label.Length > 100
                || request.Price is <= 0 or > 100000000 || decimal.Round(request.Price, 2) != request.Price || request.InitialStock is < 0 or > 100000)
                throw new BusinessValidationException("Enter a SKU, variant label, price and valid opening stock.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var parent = await db.Products.Include(p => p.Categories).Include(p => p.Tags).SingleOrDefaultAsync(p => p.Id == id, ct) ?? throw new NotFoundException("Parent product was not found.");
            if (parent.ParentProductId is not null) throw new BusinessValidationException("Variants must belong to a parent product.");
            if (parent.StockQuantity > 0) throw new BusinessValidationException("Reconcile the parent product stock before introducing individually stocked variants.");
            if (await db.Products.AnyAsync(p => p.ParentProductId == id && p.VariantLabel == request.Label.Trim(), ct)) throw new ResourceConflictException("This variant label already exists.");
            var created = await inventory.CreateProductAsync(new CreateProductRequest(request.Sku, parent.Name + " — " + request.Label.Trim(), request.Price,
                parent.IsActive, parent.Description, parent.ImageUrl, parent.BrandId, parent.ProductLineId), ct);
            var child = await db.Products.Include(p => p.Categories).SingleAsync(p => p.Id == created.Id, ct);
            child.ParentProductId = parent.Id; child.VariantLabel = request.Label.Trim(); child.Currency = parent.Currency;
            db.ProductCategories.RemoveRange(child.Categories);
            child.Categories = parent.Categories.Select(c => new ProductCategory { CategoryId = c.CategoryId, IsPrimary = c.IsPrimary }).ToList();
            child.Tags = parent.Tags.Select(t => new ProductTag { TagId = t.TagId }).ToList();
            await db.SaveChangesAsync(ct);
            if (request.InitialStock > 0)
            {
                child.StockQuantity = request.InitialStock;
                db.InventoryMovements.Add(new InventoryMovement { ProductId = child.Id, Delta = request.InitialStock,
                    Reason = "Variant opening stock", CreatedAt = clock.UtcNow, CreatedByUserId = caller.UserId });
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct); return Results.Ok(new { child.Id });
        }).RequireAuthorization(Policies.InventoryOrAdmin);
    }
}
