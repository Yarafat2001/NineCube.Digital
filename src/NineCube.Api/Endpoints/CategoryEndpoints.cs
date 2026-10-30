using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class CategoryEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var categoryGroup = app.MapGroup("/api/categories")
            .WithTags("Categories");

        categoryGroup.MapGet("/", GetCategoryTreeAsync)
            .AllowAnonymous()
            .WithName("GetCategoryTree")
            .WithSummary("Hierarchical category tree with product counts.");

        categoryGroup.MapGet("/{id:int}", GetCategoryByIdAsync)
            .AllowAnonymous()
            .WithName("GetCategoryById")
            .WithSummary("Retrieves a single category node by id.");

        categoryGroup.MapPost("/", CreateCategoryAsync)
            .RequireAuthorization(Policies.StaffOrAdmin)
            .WithName("CreateCategory")
            .WithSummary("Creates a new category in the tree.");

        categoryGroup.MapPut("/{id:int}", UpdateCategoryAsync)
            .RequireAuthorization(Policies.StaffOrAdmin)
            .WithName("UpdateCategory")
            .WithSummary("Updates category name, slug, description, or active status.");

        categoryGroup.MapPost("/{id:int}/move", MoveCategoryAsync)
            .RequireAuthorization(Policies.StaffOrAdmin)
            .WithName("MoveCategory")
            .WithSummary("Reparents a category subtree.");

        categoryGroup.MapDelete("/{id:int}", DeleteCategoryAsync)
            .RequireAuthorization(Policies.StaffOrAdmin)
            .WithName("DeleteCategory")
            .WithSummary("Deletes a category node and optionally reassigns products.");

        var tagGroup = app.MapGroup("/api/tags")
            .WithTags("Tags");

        tagGroup.MapGet("/", GetTagsAsync)
            .AllowAnonymous()
            .WithName("GetTags")
            .WithSummary("Retrieves all product tags with usage counts.");
    }

    public static async Task<Results<Ok<IReadOnlyList<CategoryDto>>, ForbidHttpResult, ProblemHttpResult>> GetCategoryTreeAsync(
        [FromQuery] bool includeInactive = false,
        CategoryService service = null!,
        ClaimsPrincipal user = null!,
        CancellationToken ct = default)
    {
        bool canManage = user.IsInRole("Staff") || user.IsInRole("Administrator");
        if (includeInactive && !canManage)
            return TypedResults.Forbid();

        var tree = await service.TreeAsync(includeInactive, ct);
        return TypedResults.Ok(tree);
    }

    public static async Task<Results<Ok<CategoryDto>, ForbidHttpResult, ProblemHttpResult>> GetCategoryByIdAsync(
        int id,
        [FromQuery] bool includeInactive = false,
        CategoryService service = null!,
        ClaimsPrincipal user = null!,
        CancellationToken ct = default)
    {
        bool canManage = user.IsInRole("Staff") || user.IsInRole("Administrator");
        if (includeInactive && !canManage)
            return TypedResults.Forbid();

        var category = await service.GetAsync(id, includeInactive, ct);
        return TypedResults.Ok(category);
    }

    public static async Task<Results<Created<CategoryDto>, ProblemHttpResult>> CreateCategoryAsync(
        CategoryRequest request,
        CategoryService service,
        CancellationToken ct)
    {
        var category = await service.CreateAsync(request, ct);
        return TypedResults.Created($"/api/categories/{category.Id}", category);
    }

    public static async Task<Results<Ok<CategoryDto>, ProblemHttpResult>> UpdateCategoryAsync(
        int id,
        CategoryRequest request,
        CategoryService service,
        CancellationToken ct)
    {
        var category = await service.UpdateAsync(id, request, ct);
        return TypedResults.Ok(category);
    }

    public static async Task<Results<Ok<CategoryDto>, ProblemHttpResult>> MoveCategoryAsync(
        int id,
        MoveCategoryRequest request,
        CategoryService service,
        CancellationToken ct)
    {
        var category = await service.MoveAsync(id, request, ct);
        return TypedResults.Ok(category);
    }

    public static async Task<Results<NoContent, ProblemHttpResult>> DeleteCategoryAsync(
        int id,
        [FromQuery] int? reassignToCategoryId,
        CategoryService service,
        CancellationToken ct)
    {
        await service.DeleteAsync(id, reassignToCategoryId, ct);
        return TypedResults.NoContent();
    }

    public static async Task<Results<Ok<IReadOnlyList<TagDto>>, ProblemHttpResult>> GetTagsAsync(
        CategoryService service,
        CancellationToken ct)
    {
        var tags = await service.TagsAsync(ct);
        return TypedResults.Ok(tags);
    }
}
