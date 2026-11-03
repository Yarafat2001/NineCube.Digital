using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record ReviewModerationRequest(bool IsApproved, string? Response);
public sealed record ReviewReportRequest(string Reason);
public sealed class ReviewModerationEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/reviews/moderation", async (IAppDbContext db, CancellationToken ct) => Results.Ok(await db.ProductReviews.AsNoTracking()
            .OrderBy(r => r.IsApproved).ThenByDescending(r => r.CreatedAt).Take(100)
            .Select(r => new { r.Id, r.ProductId, r.Rating, r.Comment, r.IsApproved, r.MerchantResponse, r.CreatedAt,
                reports = db.ReviewReports.Count(p => p.ReviewId == r.Id) }).ToListAsync(ct))).RequireAuthorization(Policies.StaffOrAdmin);
        app.MapPut("/api/reviews/{id:int}/moderation", async (int id, ReviewModerationRequest request, IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            if (request.Response?.Length > 2000) throw new BusinessValidationException("Use at most 2000 characters for the response.");
            var review = await db.ProductReviews.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException("Review was not found.");
            review.IsApproved = request.IsApproved; review.MerchantResponse = request.Response?.Trim();
            db.AuditLogs.Add(new AuditLog { UserId = caller.UserId, Action = "review.moderated", EntityType = "ProductReview", EntityId = id.ToString(), CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); return Results.NoContent();
        }).RequireAuthorization(Policies.StaffOrAdmin);
        app.MapPost("/api/reviews/{id:int}/report", async (int id, ReviewReportRequest request, IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 1000) throw new BusinessValidationException("Enter a report reason of at most 1000 characters.");
            if (!await db.ProductReviews.AnyAsync(r => r.Id == id && r.IsApproved, ct)) throw new NotFoundException("Review was not found.");
            if (await db.ReviewReports.AnyAsync(r => r.ReviewId == id && r.CustomerId == caller.CustomerId, ct)) return Results.NoContent();
            db.ReviewReports.Add(new ReviewReport { ReviewId = id, CustomerId = caller.CustomerId!.Value, Reason = request.Reason.Trim(), CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); return Results.NoContent();
        }).RequireAuthorization(Policies.CustomerOnly).RequireRateLimiting("checkout");
    }
}
