using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record StockCountRequest(int ExpectedQuantity, int CountedQuantity, string Reason, string? Location);

public sealed class StockCountEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inventory/counts").RequireAuthorization(Policies.InventoryOrAdmin);
        group.MapGet("/", async (string? q, IAppDbContext db, CancellationToken ct) =>
        {
            var query = db.Products.AsNoTracking().Where(p => !p.Variants.Any(v => v.IsActive));
            if (!string.IsNullOrWhiteSpace(q)) query = query.Where(p => p.Name.ToLower().Contains(q.ToLower()) || p.Sku.ToLower().Contains(q.ToLower()));
            var products = await query.OrderBy(p => p.Name).Take(100).Select(p => new { p.Id, p.Sku, p.Name, p.StockQuantity, p.UnitCost, p.Currency }).ToListAsync(ct);
            var keys = products.Select(p => $"inventory.location:{p.Id}").ToArray();
            var locations = await db.Settings.AsNoTracking().Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, s => s.Value, ct);
            return Results.Ok(products.Select(p => new { p.Id, p.Sku, p.Name, p.StockQuantity, p.UnitCost, p.Currency,
                location = locations.GetValueOrDefault($"inventory.location:{p.Id}", ""), availableCostValue = p.StockQuantity * p.UnitCost }));
        });
        group.MapPost("/{id:int}", async (int id, StockCountRequest request, IAppDbContext db, IClock clock, ICurrentUser caller, INotificationWriter notifications, CancellationToken ct) =>
        {
            if (request.ExpectedQuantity < 0 || request.CountedQuantity is < 0 or > 1000000 || string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 400 || request.Location?.Length > 120)
                throw new BusinessValidationException("Enter a valid available quantity, stock location and count reason.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Products\" WHERE \"Id\" = {id} FOR UPDATE", ct);
            var product = await db.Products.SingleOrDefaultAsync(p => p.Id == id, ct) ?? throw new NotFoundException("Product was not found.");
            if (await db.Products.AnyAsync(p => p.ParentProductId == id && p.IsActive, ct)) throw new BusinessValidationException("Count individual variant SKUs.");
            if (product.StockQuantity != request.ExpectedQuantity) throw new ResourceConflictException("Stock changed while counting. Reload the count sheet and recount available units.");
            var delta = request.CountedQuantity - product.StockQuantity;
            product.StockQuantity = request.CountedQuantity; product.UpdatedAt = clock.UtcNow;
            var key = $"inventory.location:{id}";
            var locator = await db.Settings.SingleOrDefaultAsync(s => s.Key == key, ct);
            if (locator is null) { locator = new Setting { Key = key }; db.Settings.Add(locator); }
            locator.Value = request.Location?.Trim() ?? "";
            if (delta != 0) db.InventoryMovements.Add(new InventoryMovement { ProductId = id, Delta = delta, Reason = $"Stock count: {request.Reason.Trim()}", CreatedAt = clock.UtcNow, CreatedByUserId = caller.UserId });
            db.AuditLogs.Add(new AuditLog { Action = "inventory.counted", EntityType = "Product", EntityId = id.ToString(), UserId = caller.UserId, CreatedAt = clock.UtcNow,
                Details = $"before={request.ExpectedQuantity}; counted={request.CountedQuantity}; location={locator.Value}; reason={request.Reason.Trim()}" });
            await db.SaveChangesAsync(ct);
            if (delta < 0) { await notifications.QueueLowStockAsync(id, ct); await db.SaveChangesAsync(ct); }
            await tx.CommitAsync(ct); return Results.NoContent();
        });
    }
}
