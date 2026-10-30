using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class ReportEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/reports")
            .WithTags("Reports")
            .RequireAuthorization(Policies.StaffOrAdmin);

        group.MapGet("/sales", GetSalesSummaryAsync)
            .WithName("GetSalesSummary")
            .WithSummary("Read-only sales summary: order count and revenue grouped by status for a date range.");
    }

    public static async Task<Results<Ok<SalesSummaryDto>, ProblemHttpResult>> GetSalesSummaryAsync(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string currency = "BDT",
        IReportService reports = null!,
        CancellationToken ct = default)
    {
        var summary = await reports.GetSalesSummaryAsync(from, to, ct, currency);
        return TypedResults.Ok(summary);
    }
}
