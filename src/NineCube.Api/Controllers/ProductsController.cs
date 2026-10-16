using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Api.Controllers;

[Route("api/products")]
[Produces("application/json")]
[Authorize] // Anonymous browsing is disabled: stock levels are business data (see README assumptions).
public sealed class ProductsController : ApiControllerBase
{
    private readonly ICatalogService _catalog;
    private readonly IInventoryService _inventory;
    private readonly IProductImageService _images;
    private readonly ISettingsService _settings;
    private readonly IBulkProductService _bulk;
    private readonly IValidator<CreateProductRequest> _createValidator;
    private readonly IValidator<UpdateProductRequest> _updateValidator;
    private readonly IValidator<StockAdjustmentRequest> _adjustValidator;
    private readonly IValidator<BulkProductRequest> _bulkValidator;

    public ProductsController(
        ICatalogService catalog,
        IInventoryService inventory,
        IProductImageService images,
        ISettingsService settings,
        IBulkProductService bulk,
        IValidator<CreateProductRequest> createValidator,
        IValidator<UpdateProductRequest> updateValidator,
        IValidator<StockAdjustmentRequest> adjustValidator,
        IValidator<BulkProductRequest> bulkValidator)
    {
        _catalog = catalog;
        _inventory = inventory;
        _images = images;
        _settings = settings;
        _bulk = bulk;
        _createValidator = createValidator;
        _updateValidator = updateValidator;
        _adjustValidator = adjustValidator;
        _bulkValidator = bulkValidator;
    }

    /// <summary>Live catalogue with current stock. Available to every authenticated role.</summary>
    [HttpGet]
    [Authorize(Policy = Policies.AnyAuthenticated)]
    [ProducesResponseType(typeof(PagedResult<ProductDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<ProductDto>>> Search(
        [FromQuery] string? q,
        [FromQuery] bool? isActive,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default,
        [FromQuery] int? categoryId = null, [FromQuery] string? categorySlug = null,
        [FromQuery] bool includeDescendants = true, [FromQuery] string? tag = null,
        [FromQuery] bool? inStock = null, [FromQuery] decimal? minPrice = null,
        [FromQuery] decimal? maxPrice = null, [FromQuery] string sort = "name",
        [FromQuery] string[]? brand = null, [FromQuery] string[]? line = null) =>
        Ok(await _catalog.SearchAsync(q, isActive, page, pageSize, ct,
            new CatalogFilters(categoryId, categorySlug, includeDescendants, tag, inStock, minPrice, maxPrice, sort, brand, line)));

    /// <summary>
    /// The configured low stock threshold. Every authenticated role needs it to label stock
    /// levels consistently, and it is a read-only business value, so it is not restricted to
    /// the Administrator.
    /// </summary>
    [HttpGet("low-stock-threshold")]
    [Authorize(Policy = Policies.AnyAuthenticated)]
    [ProducesResponseType(typeof(SettingsDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<SettingsDto>> LowStockThreshold(CancellationToken ct) =>
        Ok(new SettingsDto(await _settings.GetLowStockThresholdAsync(ct)));

    /// <summary>Products at or below the configured low stock threshold.</summary>
    [HttpGet("low-stock")]
    [Authorize(Policy = Policies.StaffInventoryOrAdmin)]
    [ProducesResponseType(typeof(IReadOnlyList<ProductDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ProductDto>>> LowStock(CancellationToken ct) =>
        Ok(await _catalog.GetLowStockAsync(ct));

    [HttpGet("{id:int}")]
    [Authorize(Policy = Policies.AnyAuthenticated)]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProductDto>> GetById(int id, CancellationToken ct) =>
        Ok(await _catalog.GetAsync(id, ct));

    [HttpPut("{id:int}/categories")]
    [Authorize(Policy = Policies.StaffOrAdmin)]
    public async Task<ActionResult<ProductDto>> Categories(int id, ProductCategoriesRequest request, [FromServices] CategoryService service, CancellationToken ct) =>
        Ok(await service.SetProductAsync(id, request, ct));

    /// <summary>Stock movement ledger for a product.</summary>
    [HttpGet("{id:int}/movements")]
    [Authorize(Policy = Policies.InventoryOrAdmin)]
    [ProducesResponseType(typeof(PagedResult<InventoryMovementDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<InventoryMovementDto>>> Movements(
        int id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default) =>
        Ok(await _inventory.GetMovementsAsync(id, page, pageSize, ct));

    [HttpPost]
    [Authorize(Policy = Policies.InventoryManagerOnly)]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ProductDto>> Create([FromBody] CreateProductRequest request, CancellationToken ct)
    {
        await ValidateAsync(_createValidator, request, ct);
        var product = await _inventory.CreateProductAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
    }

    /// <summary>
    /// Batch edit of category, tags, active flag or brand for up to 200 products in one transaction.
    /// Stock is never touched here: it only moves through the atomic conditional update behind
    /// POST /api/products/{id}/stock-adjustments.
    /// </summary>
    [HttpPost("bulk")]
    [Authorize(Policy = Policies.StaffInventoryOrAdmin)]
    [ProducesResponseType(typeof(BulkProductResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<BulkProductResultDto>> Bulk([FromBody] BulkProductRequest request, CancellationToken ct)
    {
        await ValidateAsync(_bulkValidator, request, ct);
        return Ok(await _bulk.ApplyAsync(request, ct));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.InventoryManagerOnly)]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProductDto>> Update(int id, [FromBody] UpdateProductRequest request, CancellationToken ct)
    {
        await ValidateAsync(_updateValidator, request, ct);
        return Ok(await _inventory.UpdateProductAsync(id, request, ct));
    }

    /// <summary>
    /// Signed delta adjustment with a mandatory reason. Same atomic conditional update as order
    /// placement, so a concurrent order can never be overwritten and stock can never go negative.
    /// </summary>
    [HttpPost("{id:int}/stock-adjustments")]
    [Authorize(Policy = Policies.InventoryManagerOnly)]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ProductDto>> AdjustStock(int id, [FromBody] StockAdjustmentRequest request, CancellationToken ct)
    {
        await ValidateAsync(_adjustValidator, request, ct);
        return Ok(await _inventory.AdjustStockAsync(id, request, ct));
    }

    /// <summary>The gallery of a product, primary image first.</summary>
    [HttpGet("{id:int}/images")]
    [Authorize(Policy = Policies.AnyAuthenticated)]
    [ProducesResponseType(typeof(IReadOnlyList<ProductImageDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ProductImageDto>>> Images(int id, [FromServices] IAppDbContext db, CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(p => p.Id == id, ct)) throw new NotFoundException($"Product {id} was not found.");
        return Ok(await db.ProductImages.AsNoTracking().Where(i => i.ProductId == id)
            .OrderByDescending(i => i.IsPrimary).ThenBy(i => i.SortOrder).ThenBy(i => i.Id)
            .Select(i => new ProductImageDto(i.Id, i.Url, i.IsPrimary, i.AltText)).ToListAsync(ct));
    }

    /// <summary>
    /// Multipart upload of one product image. JPG, PNG or WebP up to 5 MB; the file is stored under a
    /// generated name in the upload folder and served back from /uploads/... . The first image of a
    /// product becomes its primary image.
    /// </summary>
    [HttpPost("{id:int}/images")]
    [Authorize(Policy = Policies.InventoryOrAdmin)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    [ProducesResponseType(typeof(ProductImageDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProductImageDto>> UploadImage(int id, IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            throw new BusinessValidationException("Choose an image file to upload.");

        await using var stream = file.OpenReadStream();
        var image = await _images.UploadAsync(id, stream, ct);
        return Created($"/api/products/{id}/images/{image.Id}", image);
    }

    [HttpPut("{id:int}/images/{imageId:int}/primary")]
    [Authorize(Policy = Policies.InventoryOrAdmin)]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductDto>> MakeImagePrimary(int id, int imageId, CancellationToken ct) =>
        Ok(await _images.SetPrimaryAsync(id, imageId, ct));

    [HttpDelete("{id:int}/images/{imageId:int}")]
    [Authorize(Policy = Policies.InventoryOrAdmin)]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductDto>> DeleteImage(int id, int imageId, CancellationToken ct) =>
        Ok(await _images.DeleteAsync(id, imageId, ct));
}
