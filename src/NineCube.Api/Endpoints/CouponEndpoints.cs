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

        group.MapGet("/campaigns", GetActiveCampaignsAsync)
            .AllowAnonymous()
            .WithName("GetActiveCampaigns")
            .WithSummary("Retrieves active promotional campaigns and announcement banners.");

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
}
