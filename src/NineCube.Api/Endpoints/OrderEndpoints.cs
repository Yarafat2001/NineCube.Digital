using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Api.Common;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed class OrderEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/orders")
            .WithTags("Orders")
            .RequireAuthorization();

        group.MapPost("/", PlaceOrderAsync)
            .RequireAuthorization(Policies.CustomerOnly)
            .WithName("PlaceOrder")
            .WithSummary("Places an order and reserves stock atomically. Send an Idempotency-Key header for safe retries.");

        group.MapGet("/", ListOrdersAsync)
            .RequireAuthorization(Policies.CustomerStaffOrAdmin)
            .WithName("ListOrders")
            .WithSummary("Customers see only their own orders; Staff and Administrator see all.");

        group.MapGet("/{id:int}", GetOrderByIdAsync)
            .RequireAuthorization(Policies.CustomerStaffOrAdmin)
            .WithName("GetOrderById")
            .WithSummary("Retrieves an order by its unique identifier.");

        group.MapPost("/{id:int}/cancel", CancelOrderAsync)
            .RequireAuthorization(Policies.CustomerOrStaff)
            .WithName("CancelOrder")
            .WithSummary("Cancels an order if eligible.");

        group.MapPost("/{id:int}/confirm", ConfirmOrderAsync)
            .RequireAuthorization(Policies.StaffOnly)
            .WithName("ConfirmOrder")
            .WithSummary("Confirms an order.");

        group.MapPost("/{id:int}/reject", RejectOrderAsync)
            .RequireAuthorization(Policies.StaffOnly)
            .WithName("RejectOrder")
            .WithSummary("Rejects a pending order and releases reserved stock.");

        group.MapPost("/{id:int}/ship", ShipOrderAsync)
            .RequireAuthorization(Policies.StaffOnly)
            .WithName("ShipOrder")
            .WithSummary("Marks an order as shipped.");

        group.MapGet("/{id:int}/invoice", GetInvoiceAsync)
            .RequireAuthorization(Policies.CustomerStaffOrAdmin)
            .WithName("GetOrderInvoice")
            .WithSummary("Generates an invoice view for the order.");
    }

    public static async Task<Results<Ok<OrderDto>, Created<OrderDto>, ProblemHttpResult>> PlaceOrderAsync(
        CreateOrderRequest request,
        IOrderService orders,
        IValidator<CreateOrderRequest> validator,
        HttpContext httpContext,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);

        string? idempotencyKey = httpContext.Request.Headers.TryGetValue("Idempotency-Key", out var headerVal)
            && !string.IsNullOrWhiteSpace(headerVal.ToString())
                ? headerVal.ToString()
                : null;

        var result = await orders.PlaceOrderAsync(request, idempotencyKey, ct);

        return result.Replayed
            ? TypedResults.Ok(result.Order)
            : TypedResults.Created($"/api/orders/{result.Order.Id}", result.Order);
    }

    public static async Task<Results<Ok<PagedResult<OrderDto>>, ProblemHttpResult>> ListOrdersAsync(
        [FromQuery] OrderStatus? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        IOrderService orders = null!,
        CancellationToken ct = default)
    {
        var result = await orders.ListOrdersAsync(status, page, pageSize, ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<OrderDto>, ProblemHttpResult>> GetOrderByIdAsync(
        int id,
        IOrderService orders,
        CancellationToken ct)
    {
        var order = await orders.GetOrderAsync(id, ct);
        return TypedResults.Ok(order);
    }

    public static async Task<Results<Ok<OrderDto>, ProblemHttpResult>> CancelOrderAsync(
        int id,
        IOrderService orders,
        CancellationToken ct)
    {
        var order = await orders.CancelAsync(id, ct);
        return TypedResults.Ok(order);
    }

    public static async Task<Results<Ok<OrderDto>, ProblemHttpResult>> ConfirmOrderAsync(
        int id,
        IOrderService orders,
        CancellationToken ct)
    {
        var order = await orders.ConfirmAsync(id, ct);
        return TypedResults.Ok(order);
    }

    public static async Task<Results<Ok<OrderDto>, ProblemHttpResult>> RejectOrderAsync(
        int id,
        IOrderService orders,
        CancellationToken ct)
    {
        var order = await orders.RejectAsync(id, ct);
        return TypedResults.Ok(order);
    }

    public static async Task<Results<Ok<OrderDto>, ProblemHttpResult>> ShipOrderAsync(
        int id,
        IOrderService orders,
        CancellationToken ct)
    {
        var order = await orders.ShipAsync(id, ct);
        return TypedResults.Ok(order);
    }

    public static async Task<Results<Ok<InvoiceDto>, ProblemHttpResult>> GetInvoiceAsync(
        int id,
        IOrderService orders,
        CancellationToken ct)
    {
        var invoice = await orders.GetInvoiceAsync(id, ct);
        return TypedResults.Ok(invoice);
    }
}
