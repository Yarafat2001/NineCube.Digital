using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed class RestockEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/restock-subscriptions").RequireAuthorization(Policies.CustomerOnly);
        group.MapGet("/", async (IAppDbContext db, ICurrentUser user, CancellationToken ct) =>
            Results.Ok(await db.RestockSubscriptions.Where(s => s.UserId == user.UserId && s.SentAt == null)
                .Select(s => s.ProductId).ToListAsync(ct)));
        group.MapPost("/{productId:int}", async (int productId, IAppDbContext db, ICurrentUser user, IClock clock, CancellationToken ct) =>
        {
            var product = await db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == productId && p.IsActive, ct)
                ?? throw new NotFoundException("Product was not found.");
            if (product.StockQuantity > 0) throw new BusinessValidationException("This product is already available.");
            var existing = await db.RestockSubscriptions.FirstOrDefaultAsync(s => s.ProductId == productId && s.UserId == user.UserId, ct);
            if (existing is null) db.RestockSubscriptions.Add(new RestockSubscription { ProductId = productId, UserId = user.UserId!.Value, CreatedAt = clock.UtcNow });
            else { existing.SentAt = null; existing.LeaseUntil = null; }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Restock alert saved for your account email." });
        }).RequireRateLimiting("checkout");
        group.MapDelete("/{productId:int}", async (int productId, IAppDbContext db, ICurrentUser user, CancellationToken ct) =>
        {
            await db.RestockSubscriptions.Where(s => s.UserId == user.UserId && s.ProductId == productId).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });
    }
}
