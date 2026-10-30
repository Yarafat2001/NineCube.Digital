using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public interface IReviewService
{
    Task<ProductReviewDto> AddReviewAsync(int productId, CreateReviewRequest request, CancellationToken ct = default);
    Task<ProductRatingSummaryDto> GetProductReviewsAsync(int productId, CancellationToken ct = default);
}

public sealed class ReviewService : IReviewService
{
    private readonly IAppDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;

    public ReviewService(
        IAppDbContext db,
        ICurrentUser currentUser,
        IClock clock)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<ProductReviewDto> AddReviewAsync(int productId, CreateReviewRequest request, CancellationToken ct = default)
    {
        if (_currentUser.CustomerId is not int customerId)
        {
            throw new ForbiddenException("Only customer accounts can submit product reviews.");
        }

        if (!await _db.Products.AnyAsync(p => p.Id == productId, ct))
        {
            throw new NotFoundException($"Product {productId} was not found.");
        }

        var existing = await _db.ProductReviews
            .FirstOrDefaultAsync(r => r.ProductId == productId && r.CustomerId == customerId, ct);

        if (existing is not null)
        {
            throw new ResourceConflictException("You have already reviewed this product.", "duplicate_review");
        }

        // Verify if customer has actually purchased this product in any confirmed/shipped order
        var isVerified = await _db.OrderItems.AsNoTracking()
            .AnyAsync(i => i.ProductId == productId
                && i.Order!.CustomerId == customerId
                && (i.Order.Status == OrderStatus.Confirmed || i.Order.Status == OrderStatus.Shipped), ct);

        var customer = await _db.Customers.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == customerId, ct);

        var review = new ProductReview
        {
            ProductId = productId,
            CustomerId = customerId,
            Rating = request.Rating,
            Comment = string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim(),
            IsVerifiedBuyer = isVerified,
            IsApproved = true,
            CreatedAt = _clock.UtcNow
        };

        _db.ProductReviews.Add(review);
        await _db.SaveChangesAsync(ct);

        return new ProductReviewDto(
            review.Id,
            review.ProductId,
            review.CustomerId,
            customer?.Name ?? "Verified Customer",
            review.Rating,
            review.Comment,
            review.IsVerifiedBuyer,
            review.CreatedAt);
    }

    public async Task<ProductRatingSummaryDto> GetProductReviewsAsync(int productId, CancellationToken ct = default)
    {
        var reviews = await _db.ProductReviews.AsNoTracking()
            .Where(r => r.ProductId == productId && r.IsApproved)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new ProductReviewDto(
                r.Id,
                r.ProductId,
                r.CustomerId,
                r.Customer!.Name,
                r.Rating,
                r.Comment,
                r.IsVerifiedBuyer,
                r.CreatedAt))
            .ToListAsync(ct);

        decimal avg = reviews.Count > 0
            ? decimal.Round((decimal)reviews.Average(r => r.Rating), 1, MidpointRounding.AwayFromZero)
            : 0;

        return new ProductRatingSummaryDto(avg, reviews.Count, reviews);
    }
}
