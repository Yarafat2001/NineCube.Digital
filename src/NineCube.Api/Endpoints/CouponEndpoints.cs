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

public sealed class CouponEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/coupons")
            .WithTags("Coupons");

        group.MapPost("/validate", ValidateCouponAsync)
            .AllowAnonymous()
            .WithName("ValidateCoupon")
            .WithSummary("Validates a coupon code against a cart subtotal and calculates discount.");

        group.MapPost("/evaluate-cart", EvaluateCartPromotionsAsync)
            .AllowAnonymous()
            .WithName("EvaluateCartPromotions")
            .WithSummary("Evaluates automatic campaign promotions, free shipping thresholds, and manual discounts for a cart.");

        group.MapGet("/campaigns", GetActiveCampaignsAsync)
            .AllowAnonymous()
            .WithName("GetActiveCampaigns")
            .WithSummary("Retrieves active promotional campaigns and announcement banners.");

        group.MapGet("/available", GetAvailableCouponsAsync)
            .AllowAnonymous()
            .WithName("GetAvailableCoupons")
            .WithSummary("Retrieves all active promotional coupons available to shoppers.");

        group.MapPost("/scope-preview", PreviewScopeAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("PreviewCouponScope")
            .WithSummary("Runs a draft coupon scope against the live catalogue and reports the stock value it reaches.");

        group.MapPost("/order-replay", ReplayOrdersAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("ReplayCouponAgainstOrders")
            .WithSummary("Runs a coupon's scope and rate over the shop's own past orders and reports what it would have cost.");

        group.MapGet("/", ListCouponsAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("ListCoupons")
            .WithSummary("Lists all coupons.");

        group.MapPost("/", CreateCouponAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("CreateCoupon")
            .WithSummary("Creates a new promotional discount coupon.");

        group.MapPut("/{id:int}/status", ToggleStatusAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("ToggleCouponStatus")
            .WithSummary("Enables or disables an existing coupon.");

        group.MapPut("/{id:int}/approve", ApproveCouponAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("ApproveCoupon")
            .WithSummary("Releases a coupon waiting on approval. Only a second administrator may do it.");

        group.MapPut("/{id:int}/reject", RejectCouponAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("RejectCoupon")
            .WithSummary("Refuses a coupon waiting on approval and records why, in the reviewer's own words.");

        group.MapPut("/{id:int}", UpdateCouponAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("UpdateCoupon")
            .WithSummary("Updates discount value and rules of an existing coupon.");

        group.MapDelete("/{id:int}", DeleteCouponAsync)
            .RequireAuthorization(Policies.AdministratorOnly)
            .WithName("DeleteCoupon")
            .WithSummary("Deletes an existing coupon.");
    }

    public static async Task<Results<Ok<CartPromotionsEvaluationResult>, ProblemHttpResult>> EvaluateCartPromotionsAsync(
        EvaluateCartPromotionsRequest request,
        ICouponService couponService,
        CancellationToken ct)
    {
        var result = await couponService.EvaluateCartPromotionsAsync(request, ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<IReadOnlyList<CouponDto>>, ProblemHttpResult>> GetAvailableCouponsAsync(
        ICouponService couponService,
        CancellationToken ct)
    {
        var coupons = await couponService.GetAvailableCouponsAsync(ct);
        return TypedResults.Ok(coupons);
    }

    public static async Task<Results<Ok<CouponScopePreviewResult>, ProblemHttpResult>> PreviewScopeAsync(
        CouponScopePreviewRequest request,
        ICouponService couponService,
        CancellationToken ct)
    {
        var preview = await couponService.PreviewScopeAsync(request, ct);
        return TypedResults.Ok(preview);
    }

    public static async Task<Results<Ok<CouponOrderReplayResult>, ProblemHttpResult>> ReplayOrdersAsync(
        CouponOrderReplayRequest request,
        ICouponService couponService,
        CancellationToken ct)
    {
        var replay = await couponService.ReplayAgainstOrdersAsync(request, ct);
        return TypedResults.Ok(replay);
    }

    public static async Task<Results<Ok<IReadOnlyList<CouponDto>>, ProblemHttpResult>> GetActiveCampaignsAsync(
        ICouponService couponService,
        CancellationToken ct)
    {
        var campaigns = await couponService.GetActiveCampaignBannersAsync(ct);
        return TypedResults.Ok(campaigns);
    }

    public static async Task<Results<Ok<CouponValidationResult>, ProblemHttpResult>> ValidateCouponAsync(
        ApplyCouponRequest request,
        ICouponService couponService,
        IValidator<ApplyCouponRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var result = await couponService.ValidateCouponAsync(request, ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<IReadOnlyList<CouponDto>>, ProblemHttpResult>> ListCouponsAsync(
        ICouponService couponService,
        CancellationToken ct)
    {
        var coupons = await couponService.ListCouponsAsync(ct);
        return TypedResults.Ok(coupons);
    }

    public static async Task<Results<Created<CouponDto>, ProblemHttpResult>> CreateCouponAsync(
        CreateCouponRequest request,
        ICouponService couponService,
        IValidator<CreateCouponRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var coupon = await couponService.CreateCouponAsync(request, ct);
        return TypedResults.Created($"/api/coupons/{coupon.Id}", coupon);
    }

    public static async Task<Results<Ok<object>, ProblemHttpResult>> ToggleStatusAsync(
        int id,
        bool isActive,
        ICouponService couponService,
        CancellationToken ct)
    {
        var result = await couponService.ToggleCouponStatusAsync(id, isActive, ct);
        return TypedResults.Ok<object>(new { success = result, isActive });
    }

    public static async Task<Results<Ok<CouponDto>, ProblemHttpResult>> UpdateCouponAsync(
        int id,
        UpdateCouponRequest request,
        ICouponService couponService,
        CancellationToken ct)
    {
        var coupon = await couponService.UpdateCouponAsync(id, request, ct);
        return TypedResults.Ok(coupon);
    }

    public static async Task<Results<Ok<CouponDto>, ProblemHttpResult>> ApproveCouponAsync(
        int id,
        ICouponService couponService,
        CancellationToken ct)
    {
        var coupon = await couponService.ApproveCouponAsync(id, ct);
        return TypedResults.Ok(coupon);
    }

    public static async Task<Results<Ok<CouponDto>, ProblemHttpResult>> RejectCouponAsync(
        int id,
        RejectCouponRequest request,
        ICouponService couponService,
        CancellationToken ct)
    {
        var coupon = await couponService.RejectCouponAsync(id, request, ct);
        return TypedResults.Ok(coupon);
    }

    public static async Task<Results<Ok<object>, ProblemHttpResult>> DeleteCouponAsync(
        int id,
        ICouponService couponService,
        CancellationToken ct)
    {
        var result = await couponService.DeleteCouponAsync(id, ct);
        return TypedResults.Ok<object>(new { success = result, id });
    }
}
