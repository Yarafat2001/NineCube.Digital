using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record SavedCartRequest(IReadOnlyList<OrderLineRequest> Items, int Version);
public sealed class CartEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/me/cart").RequireAuthorization(Policies.CustomerOnly);
        group.MapGet("/", async (IAppDbContext db, ICurrentUser caller, CancellationToken ct) =>
        {
            var cart = await db.SavedCarts.AsNoTracking().SingleOrDefaultAsync(c => c.CustomerId == caller.CustomerId, ct);
            var items = JsonSerializer.Deserialize<List<OrderLineRequest>>(cart?.ItemsJson ?? "[]")!;
            var ids = items.Select(i => i.ProductId).ToArray();
            var products = await db.Products.AsNoTracking().Where(p => ids.Contains(p.Id)).Select(p => new { p.Id, p.Sku, p.Name, p.Price, p.Currency, p.StockQuantity, p.IsActive }).ToListAsync(ct);
            return Results.Ok(new { version = cart?.Version ?? 0, lines = items.Where(i => products.Any(p => p.Id == i.ProductId)).Select(i => {
                var p = products.Single(p => p.Id == i.ProductId);
                return new { productId = p.Id, p.Sku, p.Name, unitPrice = p.Price, p.Currency, quantity = i.Quantity, available = p.IsActive ? p.StockQuantity : 0 };
            }) });
        });
        group.MapPut("/", async (SavedCartRequest request, IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            if (request.Items is null || request.Items.Count > 200 || request.Items.Any(i => i.Quantity is < 1 or > 1000)
                || request.Items.Select(i => i.ProductId).Distinct().Count() != request.Items.Count)
                throw new BusinessValidationException("Use up to 200 distinct product lines and quantities from 1 to 1000.");
            var ids = request.Items.Select(i => i.ProductId).ToArray();
            if (await db.Products.CountAsync(p => ids.Contains(p.Id), ct) != ids.Length) throw new BusinessValidationException("A cart product no longer exists.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Customers\" WHERE \"Id\" = {caller.CustomerId} FOR UPDATE", ct);
            var cart = await db.SavedCarts.SingleOrDefaultAsync(c => c.CustomerId == caller.CustomerId, ct);
            if ((cart?.Version ?? 0) != request.Version) throw new ResourceConflictException("Your cart changed on another device. Refresh it before saving.", "cart_changed");
            if (cart is null) { cart = new SavedCart { CustomerId = caller.CustomerId!.Value }; db.SavedCarts.Add(cart); }
            cart.Version++; cart.ItemsJson = JsonSerializer.Serialize(request.Items); cart.UpdatedAt = clock.UtcNow;
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.Ok(new { cart.Version });
        });
    }
}
