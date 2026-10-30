using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class WishlistEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/wishlist")
            .WithTags("Wishlist")
            .RequireAuthorization(Policies.CustomerOnly);

        group.MapGet("/", GetWishlistAsync)
            .WithName("GetCustomerWishlist")
            .WithSummary("Retrieves all saved items in the customer's wishlist.");

        group.MapPost("/{productId:int}/toggle", ToggleWishlistAsync)
            .WithName("ToggleWishlistItem")
            .WithSummary("Adds or removes a product from the caller's wishlist.");
    }

    public static async Task<Results<Ok<IReadOnlyList<WishlistItemDto>>, ProblemHttpResult>> GetWishlistAsync(
        IWishlistService wishlistService,
        CancellationToken ct)
    {
        var items = await wishlistService.GetWishlistAsync(ct);
        return TypedResults.Ok(items);
    }

    public static async Task<Results<Ok<object>, ProblemHttpResult>> ToggleWishlistAsync(
        int productId,
        IWishlistService wishlistService,
        CancellationToken ct)
    {
        var inWishlist = await wishlistService.ToggleWishlistAsync(productId, ct);
        return TypedResults.Ok<object>(new { inWishlist });
    }
}
