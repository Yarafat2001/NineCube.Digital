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

public sealed class PaymentEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/payments")
            .WithTags("Payments");

        group.MapPost("/process", ProcessPaymentAsync)
            .RequireAuthorization(Policies.CustomerOnly)
            .RequireRateLimiting("checkout")
            .WithName("ProcessPayment")
            .WithSummary("Processes or records a payment for an existing order.");

        group.MapPost("/callback", ProcessCallbackAsync)
            .AllowAnonymous()
            .DisableAntiforgery()
            .WithName("PaymentGatewayCallback")
            .WithSummary("Gateway webhook / callback listener for asynchronous transaction capture.");

        group.MapGet("/order/{orderId:int}", GetOrderTransactionsAsync)
            .RequireAuthorization(Policies.CustomerStaffOrAdmin)
            .WithName("GetOrderPayments")
            .WithSummary("Retrieves all payment transactions associated with an order.");
    }

    public static async Task<Results<Ok<PaymentTransactionDto>, ProblemHttpResult>> ProcessPaymentAsync(
        ProcessPaymentRequest request,
        IPaymentService paymentService,
        IValidator<ProcessPaymentRequest> validator,
        CancellationToken ct)
    {
        await ValidationHelper.ValidateAsync(validator, request, ct);
        var transaction = await paymentService.ProcessPaymentAsync(request, ct);
        return TypedResults.Ok(transaction);
    }

    public static async Task<IResult> ProcessCallbackAsync(
        HttpRequest request,
        IPaymentService paymentService,
        CancellationToken ct)
    {
        var validationId = request.HasFormContentType
            ? (await request.ReadFormAsync(ct))["val_id"].ToString()
            : (await request.ReadFromJsonAsync<PaymentCallbackRequest>(ct))?.ValidationId;
        var transaction = await paymentService.ProcessCallbackAsync(new PaymentCallbackRequest(validationId ?? ""), ct);
        return TypedResults.Ok(new { transaction.OrderId, transaction.Status, message = "Payment verified. You can return to your order." });
    }

    public static async Task<Results<Ok<IReadOnlyList<PaymentTransactionDto>>, ProblemHttpResult>> GetOrderTransactionsAsync(
        int orderId,
        IPaymentService paymentService,
        CancellationToken ct)
    {
        var transactions = await paymentService.GetOrderTransactionsAsync(orderId, ct);
        return TypedResults.Ok(transactions);
    }
}
