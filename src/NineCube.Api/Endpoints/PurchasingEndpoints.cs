using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record SupplierRequest(string Name, string? Email, string? Phone);
public sealed record PurchaseLineRequest(int ProductId, int Quantity, decimal UnitCost);
public sealed record PurchaseRequest(int SupplierId, string Reference, string Currency, IReadOnlyList<PurchaseLineRequest> Lines);
public sealed record ReceiveLineRequest(int LineId, int Quantity);
public sealed record ReceivePurchaseRequest(IReadOnlyList<ReceiveLineRequest> Lines);

public sealed class PurchasingEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/purchasing").RequireAuthorization(Policies.InventoryOrAdmin);
        group.MapGet("/suppliers", async (IAppDbContext db, CancellationToken ct) => Results.Ok(await db.Suppliers.AsNoTracking().OrderBy(s => s.Name).ToListAsync(ct)));
        group.MapPost("/suppliers", async (SupplierRequest request, IAppDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 200 || request.Email?.Length > 256 || request.Phone?.Length > 32)
                throw new BusinessValidationException("Enter a supplier name and valid contact details.");
            var supplier = new Supplier { Name = request.Name.Trim(), Email = request.Email?.Trim(), Phone = request.Phone?.Trim() };
            db.Suppliers.Add(supplier); await db.SaveChangesAsync(ct); return Results.Ok(supplier);
        });
        group.MapGet("/orders", async (IAppDbContext db, CancellationToken ct) => Results.Ok(await db.PurchaseOrders.AsNoTracking().Include(p => p.Lines).OrderByDescending(p => p.Id).Take(100).ToListAsync(ct)));
        group.MapPost("/orders", async (PurchaseRequest request, IAppDbContext db, IClock clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Reference) || request.Reference.Length > 100 || request.Currency is not ("BDT" or "USD")
                || request.Lines is null || request.Lines.Count is < 1 or > 200 || request.Lines.Any(l => l.Quantity is < 1 or > 100000 || l.UnitCost is < 0 or > 100000000 || decimal.Round(l.UnitCost, 2) != l.UnitCost)
                || request.Lines.Select(l => l.ProductId).Distinct().Count() != request.Lines.Count)
                throw new BusinessValidationException("Enter a reference, currency and distinct purchase lines with valid quantities and costs.");
            if (!await db.Suppliers.AnyAsync(s => s.Id == request.SupplierId && s.IsActive, ct)) throw new NotFoundException("Supplier was not found.");
            var ids = request.Lines.Select(l => l.ProductId).ToArray();
            if (await db.Products.CountAsync(p => ids.Contains(p.Id) && p.Currency == request.Currency, ct) != ids.Length)
                throw new BusinessValidationException("Choose products in the purchase currency.");
            if (await db.PurchaseOrders.AnyAsync(p => p.SupplierId == request.SupplierId && p.Reference == request.Reference.Trim(), ct))
                throw new ResourceConflictException("This supplier reference is already recorded.");
            var purchase = new PurchaseOrder { SupplierId = request.SupplierId, Reference = request.Reference.Trim(), Currency = request.Currency, CreatedAt = clock.UtcNow,
                Lines = request.Lines.Select(l => new PurchaseOrderLine { ProductId = l.ProductId, Quantity = l.Quantity, UnitCost = l.UnitCost }).ToList() };
            db.PurchaseOrders.Add(purchase); await db.SaveChangesAsync(ct); return Results.Ok(purchase);
        });
        group.MapPost("/orders/{id:int}/receive", async (int id, ReceivePurchaseRequest request, IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            if (request.Lines is null || request.Lines.Count is < 1 or > 200 || request.Lines.Any(l => l.Quantity < 1) || request.Lines.Select(l => l.LineId).Distinct().Count() != request.Lines.Count)
                throw new BusinessValidationException("Choose distinct receipt lines with positive quantities.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"PurchaseOrders\" WHERE \"Id\" = {id} FOR UPDATE", ct);
            var purchase = await db.PurchaseOrders.Include(p => p.Lines).SingleOrDefaultAsync(p => p.Id == id, ct) ?? throw new NotFoundException("Purchase order was not found.");
            foreach (var received in request.Lines.OrderBy(l => purchase.Lines.FirstOrDefault(p => p.Id == l.LineId)?.ProductId))
            {
                var line = purchase.Lines.SingleOrDefault(l => l.Id == received.LineId) ?? throw new BusinessValidationException("Receipt line does not belong to this purchase.");
                if (received.Quantity > line.Quantity - line.ReceivedQuantity) throw new ResourceConflictException("Receipt exceeds the outstanding quantity.");
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Products\" WHERE \"Id\" = {line.ProductId} FOR UPDATE", ct);
                var product = await db.Products.SingleAsync(p => p.Id == line.ProductId, ct);
                var quantity = checked(product.StockQuantity + received.Quantity);
                product.UnitCost = decimal.Round((product.StockQuantity * product.UnitCost + received.Quantity * line.UnitCost) / quantity, 2);
                product.StockQuantity = quantity; product.UpdatedAt = clock.UtcNow;
                line.ReceivedQuantity += received.Quantity;
                db.InventoryMovements.Add(new InventoryMovement { ProductId = product.Id, Delta = received.Quantity,
                    Reason = $"Purchase #{purchase.Id} received", CreatedAt = clock.UtcNow, CreatedByUserId = caller.UserId });
            }
            purchase.Status = purchase.Lines.All(l => l.Quantity == l.ReceivedQuantity) ? "Received" : "PartiallyReceived";
            db.AuditLogs.Add(new AuditLog { Action = "purchase.received", EntityType = "PurchaseOrder", EntityId = id.ToString(), UserId = caller.UserId, CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.Ok(purchase);
        });
    }
}
