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

public sealed class MeEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/me")
            .WithTags("Me")
            .RequireAuthorization(Policies.AnyAuthenticated);

        group.MapGet("/", GetProfileAsync)
            .WithName("GetCallerProfile")
            .WithSummary("Profile of the caller's own account.");

        group.MapPut("/", UpdateProfileAsync)
            .WithName("UpdateCallerProfile")
            .WithSummary("Updates profile details for the authenticated user.");

        group.MapPut("/password", ChangePasswordAsync)
            .WithName("ChangeCallerPassword")
            .WithSummary("Changes the account password.");

        group.MapGet("/dashboard", GetDashboardAsync)
            .WithName("GetCallerDashboard")
            .WithSummary("Role-specific dashboard statistics.");

        group.MapGet("/addresses", ListAddressesAsync)
            .WithName("ListCallerAddresses")
            .WithSummary("Delivery addresses for the authenticated customer.");

        group.MapPost("/addresses", CreateAddressAsync)
            .WithName("CreateCallerAddress")
            .WithSummary("Saves a new delivery address.");

        group.MapPut("/addresses/{id:int}", UpdateAddressAsync)
            .WithName("UpdateCallerAddress")
            .WithSummary("Updates an existing delivery address.");

        group.MapDelete("/addresses/{id:int}", DeleteAddressAsync)
            .WithName("DeleteCallerAddress")
            .WithSummary("Deletes a saved delivery address.");
    }

    public static async Task<Results<Ok<ProfileDto>, ProblemHttpResult>> GetProfileAsync(
        IProfileService profile,
        CancellationToken ct)
    {
        var result = await profile.GetAsync(ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<ProfileDto>, ProblemHttpResult>> UpdateProfileAsync(
        UpdateProfileRequest request,
        IProfileService profile,
        IValidator<UpdateProfileRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var result = await profile.UpdateAsync(request, ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<NoContent, ProblemHttpResult>> ChangePasswordAsync(
        ChangePasswordRequest request,
        IProfileService profile,
        IValidator<ChangePasswordRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        await profile.ChangePasswordAsync(request, ct);
        return TypedResults.NoContent();
    }

    public static async Task<Results<Ok<DashboardDto>, ProblemHttpResult>> GetDashboardAsync(
        IDashboardService dashboard,
        CancellationToken ct)
    {
        var result = await dashboard.ForCurrentUserAsync(ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<IReadOnlyList<AddressDto>>, ProblemHttpResult>> ListAddressesAsync(
        IProfileService profile,
        CancellationToken ct)
    {
        var addresses = await profile.ListAddressesAsync(ct);
        return TypedResults.Ok(addresses);
    }

    public static async Task<Results<Created<AddressDto>, ProblemHttpResult>> CreateAddressAsync(
        AddressRequest request,
        IProfileService profile,
        IValidator<AddressRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var address = await profile.CreateAddressAsync(request, ct);
        return TypedResults.Created($"/api/me/addresses/{address.Id}", address);
    }

    public static async Task<Results<Ok<AddressDto>, ProblemHttpResult>> UpdateAddressAsync(
        int id,
        AddressRequest request,
        IProfileService profile,
        IValidator<AddressRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var address = await profile.UpdateAddressAsync(id, request, ct);
        return TypedResults.Ok(address);
    }

    public static async Task<Results<NoContent, ProblemHttpResult>> DeleteAddressAsync(
        int id,
        IProfileService profile,
        CancellationToken ct)
    {
        await profile.DeleteAddressAsync(id, ct);
        return TypedResults.NoContent();
    }
}
