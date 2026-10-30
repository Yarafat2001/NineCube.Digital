using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Api.Common;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed class ProductEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/products")
            .WithTags("Products")
            .RequireAuthorization();

        group.MapGet("/", SearchAsync)
            .RequireAuthorization(Policies.AnyAuthenticated)
            .WithName("SearchProducts")
            .WithSummary("Live catalogue with current stock. Available to every authenticated role.");

        group.MapGet("/low-stock-threshold", GetLowStockThresholdAsync)
            .RequireAuthorization(Policies.AnyAuthenticated)
            .WithName("GetLowStockThreshold")
            .WithSummary("The configured low stock threshold.");

        group.MapGet("/low-stock", GetLowStockAsync)
            .RequireAuthorization(Policies.StaffInventoryOrAdmin)
            .WithName("GetLowStockProducts")
            .WithSummary("Products at or below the configured low stock threshold.");

        group.MapGet("/{id:int}", GetByIdAsync)
            .RequireAuthorization(Policies.AnyAuthenticated)
            .WithName("GetProductById")
            .WithSummary("Retrieves product details by id.");

        group.MapPut("/{id:int}/categories", SetCategoriesAsync)
            .RequireAuthorization(Policies.StaffOrAdmin)
            .WithName("SetProductCategories")
            .WithSummary("Sets category assignments for a product.");

        group.MapGet("/{id:int}/movements", GetMovementsAsync)
            .RequireAuthorization(Policies.InventoryOrAdmin)
            .WithName("GetProductMovements")
            .WithSummary("Stock movement ledger for a product.");

        group.MapPost("/", CreateProductAsync)
            .RequireAuthorization(Policies.InventoryManagerOnly)
            .WithName("CreateProduct")
            .WithSummary("Creates a new product with zero initial stock.");

        group.MapPost("/bulk", BulkUpdateAsync)
            .RequireAuthorization(Policies.StaffInventoryOrAdmin)
            .WithName("BulkUpdateProducts")
            .WithSummary("Batch edit of category, tags, active flag or brand for up to 200 products.");

        group.MapPut("/{id:int}", UpdateProductAsync)
            .RequireAuthorization(Policies.InventoryManagerOnly)
            .WithName("UpdateProduct")
            .WithSummary("Updates product metadata (sku, name, price, brand, description).");

        group.MapPost("/{id:int}/stock-adjustments", AdjustStockAsync)
            .RequireAuthorization(Policies.InventoryManagerOnly)
            .WithName("AdjustProductStock")
            .WithSummary("Atomic conditional stock adjustment with mandatory reason audit.");

        group.MapGet("/{id:int}/images", GetImagesAsync)
            .RequireAuthorization(Policies.AnyAuthenticated)
            .WithName("GetProductImages")
            .WithSummary("Product gallery, primary image first, projected with AsNoTracking.");

        group.MapPost("/{id:int}/images", UploadImageAsync)
            .RequireAuthorization(Policies.InventoryOrAdmin)
            .DisableAntiforgery()
            .WithName("UploadProductImage")
            .WithSummary("Multipart upload of one product image (JPG, PNG, WebP up to 6 MB).");

        group.MapPut("/{id:int}/images/{imageId:int}/primary", SetPrimaryImageAsync)
            .RequireAuthorization(Policies.InventoryOrAdmin)
            .WithName("SetPrimaryProductImage")
            .WithSummary("Promotes an image to primary for the product.");

        group.MapDelete("/{id:int}/images/{imageId:int}", DeleteImageAsync)
            .RequireAuthorization(Policies.InventoryOrAdmin)
            .WithName("DeleteProductImage")
            .WithSummary("Deletes an image from the product gallery.");
    }

    public static async Task<Results<Ok<PagedResult<ProductDto>>, ProblemHttpResult>> SearchAsync(
        [FromQuery] string? q,
        [FromQuery] bool? isActive,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] int? categoryId = null,
        [FromQuery] string? categorySlug = null,
        [FromQuery] bool includeDescendants = true,
        [FromQuery] string? tag = null,
        [FromQuery] bool? inStock = null,
        [FromQuery] decimal? minPrice = null,
        [FromQuery] decimal? maxPrice = null,
        [FromQuery] string sort = "name",
        [FromQuery] string[]? brand = null,
        [FromQuery] string[]? line = null,
        ICatalogService catalog = null!,
        CancellationToken ct = default)
    {
        var filters = new CatalogFilters(categoryId, categorySlug, includeDescendants, tag, inStock, minPrice, maxPrice, sort, brand, line);
        var result = await catalog.SearchAsync(q, isActive, page, pageSize, ct, filters);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<SettingsDto>, ProblemHttpResult>> GetLowStockThresholdAsync(
        ISettingsService settings,
        CancellationToken ct)
    {
        var threshold = await settings.GetLowStockThresholdAsync(ct);
        return TypedResults.Ok(new SettingsDto(threshold));
    }

    public static async Task<Results<Ok<IReadOnlyList<ProductDto>>, ProblemHttpResult>> GetLowStockAsync(
        ICatalogService catalog,
        CancellationToken ct)
    {
        var products = await catalog.GetLowStockAsync(ct);
        return TypedResults.Ok(products);
    }

    public static async Task<Results<Ok<ProductDto>, ProblemHttpResult>> GetByIdAsync(
        int id,
        ICatalogService catalog,
        CancellationToken ct)
    {
        var product = await catalog.GetAsync(id, ct);
        return TypedResults.Ok(product);
    }

    public static async Task<Results<Ok<ProductDto>, ProblemHttpResult>> SetCategoriesAsync(
        int id,
        ProductCategoriesRequest request,
        CategoryService service,
        CancellationToken ct)
    {
        var product = await service.SetProductAsync(id, request, ct);
        return TypedResults.Ok(product);
    }

    public static async Task<Results<Ok<PagedResult<InventoryMovementDto>>, ProblemHttpResult>> GetMovementsAsync(
        int id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        IInventoryService inventory = null!,
        CancellationToken ct = default)
    {
        var movements = await inventory.GetMovementsAsync(id, page, pageSize, ct);
        return TypedResults.Ok(movements);
    }

    public static async Task<Results<Created<ProductDto>, ProblemHttpResult>> CreateProductAsync(
        CreateProductRequest request,
        IInventoryService inventory,
        IValidator<CreateProductRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var product = await inventory.CreateProductAsync(request, ct);
        return TypedResults.Created($"/api/products/{product.Id}", product);
    }

    public static async Task<Results<Ok<BulkProductResultDto>, ProblemHttpResult>> BulkUpdateAsync(
        BulkProductRequest request,
        IBulkProductService bulk,
        IValidator<BulkProductRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var result = await bulk.ApplyAsync(request, ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<ProductDto>, ProblemHttpResult>> UpdateProductAsync(
        int id,
        UpdateProductRequest request,
        IInventoryService inventory,
        IValidator<UpdateProductRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var product = await inventory.UpdateProductAsync(id, request, ct);
        return TypedResults.Ok(product);
    }

    public static async Task<Results<Ok<ProductDto>, ProblemHttpResult>> AdjustStockAsync(
        int id,
        StockAdjustmentRequest request,
        IInventoryService inventory,
        IValidator<StockAdjustmentRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var product = await inventory.AdjustStockAsync(id, request, ct);
        return TypedResults.Ok(product);
    }

    public static async Task<Results<Ok<IReadOnlyList<ProductImageDto>>, ProblemHttpResult>> GetImagesAsync(
        int id,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!await db.Products.AsNoTracking().AnyAsync(p => p.Id == id, ct))
            throw new NotFoundException($"Product {id} was not found.");

        var images = await db.ProductImages.AsNoTracking()
            .Where(i => i.ProductId == id)
            .OrderByDescending(i => i.IsPrimary)
            .ThenBy(i => i.SortOrder)
            .ThenBy(i => i.Id)
            .Select(i => new ProductImageDto(i.Id, i.Url, i.IsPrimary, i.AltText))
            .ToListAsync(ct);

        return TypedResults.Ok<IReadOnlyList<ProductImageDto>>(images);
    }

    public static async Task<Results<Created<ProductImageDto>, ProblemHttpResult>> UploadImageAsync(
        int id,
        HttpRequest request,
        IProductImageService images,
        CancellationToken ct)
    {
        if (!request.HasFormContentType)
            throw new BusinessValidationException("Choose an image file to upload.");

        var form = await request.ReadFormAsync(ct);
        var file = form.Files.GetFile("file") ?? (form.Files.Count > 0 ? form.Files[0] : null);

        if (file is null || file.Length == 0)
            throw new BusinessValidationException("Choose an image file to upload.");

        if (file.Length > 6 * 1024 * 1024)
            throw new BusinessValidationException("Image size cannot exceed 6MB.");

        await using var stream = file.OpenReadStream();
        var image = await images.UploadAsync(id, stream, ct);
        return TypedResults.Created($"/api/products/{id}/images/{image.Id}", image);
    }

    public static async Task<Results<Ok<ProductDto>, ProblemHttpResult>> SetPrimaryImageAsync(
        int id,
        int imageId,
        IProductImageService images,
        CancellationToken ct)
    {
        var product = await images.SetPrimaryAsync(id, imageId, ct);
        return TypedResults.Ok(product);
    }

    public static async Task<Results<Ok<ProductDto>, ProblemHttpResult>> DeleteImageAsync(
        int id,
        int imageId,
        IProductImageService images,
        CancellationToken ct)
    {
        var product = await images.DeleteAsync(id, imageId, ct);
        return TypedResults.Ok(product);
    }
}
