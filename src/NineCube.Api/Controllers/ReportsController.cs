using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Controllers;

[Route("api/reports")]
[Produces("application/json")]
[Authorize(Policy = Policies.StaffOrAdmin)]
public sealed class ReportsController : ApiControllerBase
{
    private readonly IReportService _reports;

    public ReportsController(IReportService reports) => _reports = reports;

    /// <summary>Read-only sales summary: order count and revenue grouped by status for a date range.</summary>
    [HttpGet("sales")]
    [ProducesResponseType(typeof(SalesSummaryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SalesSummaryDto>> Sales(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct, [FromQuery] string currency = "BDT") =>
        Ok(await _reports.GetSalesSummaryAsync(from, to, ct, currency));
}
