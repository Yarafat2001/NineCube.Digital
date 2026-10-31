using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class GiftCardEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/gift-cards")
            .WithTags("GiftCards");

        group.MapPost("/validate", ValidateGiftCardAsync)
            .AllowAnonymous()
            .WithName("ValidateGiftCard")
            .WithSummary("Validates a gift card code and returns the remaining balance.");

        group.MapGet("/", ListGiftCardsAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("ListGiftCards")
            .WithSummary("Lists all gift cards.");

        group.MapPost("/", CreateGiftCardAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("CreateGiftCard")
            .WithSummary("Issues a new digital gift card.");

        group.MapPut("/{id:int}/status", ToggleStatusAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("ToggleGiftCardStatus")
            .WithSummary("Enables or disables an existing gift card.");

        group.MapPut("/{id:int}/balance", AdjustBalanceAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("AdjustGiftCardBalance")
            .WithSummary("Adjusts the current balance of a gift card.");
    }

    public static async Task<Results<Ok<ValidateGiftCardResponse>, BadRequest<string>>> ValidateGiftCardAsync(
        ValidateGiftCardRequest request,
        IGiftCardService giftCardService,
        CancellationToken ct)
    {
        var result = await giftCardService.ValidateGiftCardAsync(request.Code, ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<IReadOnlyList<GiftCardDto>>, ProblemHttpResult>> ListGiftCardsAsync(
        IGiftCardService giftCardService,
        CancellationToken ct)
    {
        var cards = await giftCardService.ListGiftCardsAsync(ct);
        return TypedResults.Ok(cards);
    }

    public static async Task<Results<Created<GiftCardDto>, ProblemHttpResult>> CreateGiftCardAsync(
        CreateGiftCardRequest request,
        IGiftCardService giftCardService,
        CancellationToken ct)
    {
        var card = await giftCardService.CreateGiftCardAsync(request, ct);
        return TypedResults.Created($"/api/gift-cards/{card.Id}", card);
    }

    public static async Task<Results<Ok<GiftCardDto>, ProblemHttpResult>> ToggleStatusAsync(
        int id,
        IGiftCardService giftCardService,
        CancellationToken ct)
    {
        var card = await giftCardService.ToggleStatusAsync(id, ct);
        return TypedResults.Ok(card);
    }

    public static async Task<Results<Ok<GiftCardDto>, ProblemHttpResult>> AdjustBalanceAsync(
        int id,
        AdjustGiftCardBalanceRequest request,
        IGiftCardService giftCardService,
        CancellationToken ct)
    {
        var card = await giftCardService.AdjustBalanceAsync(id, request, ct);
        return TypedResults.Ok(card);
    }
}
