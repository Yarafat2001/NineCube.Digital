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
            .RequireAuthorization(Policies.AnyAuthenticated)
            .WithName("ProcessPayment")
            .WithSummary("Processes or records a payment for an existing order.");

        group.MapPost("/callback", ProcessCallbackAsync)
            .AllowAnonymous()
            .WithName("PaymentGatewayCallback")
            .WithSummary("Gateway webhook / callback listener for asynchronous transaction capture.");

        group.MapGet("/order/{orderId:int}", GetOrderTransactionsAsync)
            .RequireAuthorization(Policies.AnyAuthenticated)
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

    public static async Task<Results<Ok<PaymentTransactionDto>, ProblemHttpResult>> ProcessCallbackAsync(
        PaymentCallbackRequest request,
        IPaymentService paymentService,
        CancellationToken ct)
    {
        var transaction = await paymentService.ProcessCallbackAsync(request, ct);
        return TypedResults.Ok(transaction);
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
