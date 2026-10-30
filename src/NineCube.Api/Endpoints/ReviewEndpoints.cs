using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Api.Common;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class ReviewEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/reviews")
            .WithTags("Reviews");

        group.MapGet("/products/{productId:int}", GetProductReviewsAsync)
            .AllowAnonymous()
            .WithName("GetProductReviews")
            .WithSummary("Retrieves aggregated rating and reviews for a product.");

        group.MapPost("/products/{productId:int}", AddReviewAsync)
            .RequireAuthorization(Policies.CustomerOnly)
            .WithName("AddProductReview")
            .WithSummary("Submits a review and rating for a product (verified buyer checked).");
    }

    public static async Task<Results<Ok<ProductRatingSummaryDto>, ProblemHttpResult>> GetProductReviewsAsync(
        int productId,
        IReviewService reviewService,
        CancellationToken ct)
    {
        var summary = await reviewService.GetProductReviewsAsync(productId, ct);
        return TypedResults.Ok(summary);
    }

    public static async Task<Results<Created<ProductReviewDto>, ProblemHttpResult>> AddReviewAsync(
        int productId,
        CreateReviewRequest request,
        IReviewService reviewService,
        IValidator<CreateReviewRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var review = await reviewService.AddReviewAsync(productId, request, ct);
        return TypedResults.Created($"/api/reviews/products/{productId}", review);
    }
}
