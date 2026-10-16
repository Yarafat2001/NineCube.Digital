using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Controllers;

[Route("api/categories")]
[Produces("application/json")]
public sealed class CategoriesController(CategoryService service) : ApiControllerBase
{
    private bool Manage => User.IsInRole("Staff") || User.IsInRole("Administrator");
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<CategoryDto>>> Tree([FromQuery] bool includeInactive = false, CancellationToken ct = default)
    {
        if (includeInactive && !Manage) return Forbid();
        return Ok(await service.TreeAsync(includeInactive, ct));
    }
    [HttpGet("{id:int}")]
    [AllowAnonymous]
    public async Task<ActionResult<CategoryDto>> Get(int id, [FromQuery] bool includeInactive = false, CancellationToken ct = default)
    {
        if (includeInactive && !Manage) return Forbid();
        return Ok(await service.GetAsync(id, includeInactive, ct));
    }
    [HttpPost]
    [Authorize(Policy = Policies.StaffOrAdmin)]
    public async Task<ActionResult<CategoryDto>> Create(CategoryRequest request, CancellationToken ct)
    {
        var result = await service.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
    }
    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.StaffOrAdmin)]
    public async Task<ActionResult<CategoryDto>> Update(int id, CategoryRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));
    [HttpPost("{id:int}/move")]
    [Authorize(Policy = Policies.StaffOrAdmin)]
    public async Task<ActionResult<CategoryDto>> Move(int id, MoveCategoryRequest request, CancellationToken ct) => Ok(await service.MoveAsync(id, request, ct));
    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.StaffOrAdmin)]
    public async Task<IActionResult> Delete(int id, [FromQuery] int? reassignToCategoryId, CancellationToken ct)
    {
        await service.DeleteAsync(id, reassignToCategoryId, ct); return NoContent();
    }
}

[Route("api/tags")]
[Produces("application/json")]
public sealed class TagsController(CategoryService service) : ApiControllerBase
{
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<TagDto>>> Get(CancellationToken ct) => Ok(await service.TagsAsync(ct));
}
