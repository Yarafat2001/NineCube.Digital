using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;
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

        group.MapGet("/callback", ProcessCallbackAsync)
            .AllowAnonymous()
            .WithName("PaymentGatewayCallbackGet")
            .WithSummary("Gateway browser redirect handler for asynchronous transaction capture.");

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
        IOptions<StorefrontOptions> storefront,
        CancellationToken ct)
    {
        string? validationId = null;
        string? tranId = null;
        string? status = null;

        if (request.HasFormContentType)
        {
            var form = await request.ReadFormAsync(ct);
            validationId = form["val_id"].ToString();
            tranId = form["tran_id"].ToString();
            status = form["status"].ToString();
        }
        else if (request.QueryString.HasValue)
        {
            validationId = request.Query["val_id"].ToString();
            tranId = request.Query["tran_id"].ToString();
            status = request.Query["status"].ToString();
        }
        else if (request.ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) == true)
        {
            var json = await request.ReadFromJsonAsync<PaymentCallbackRequest>(ct);
            validationId = json?.ValidationId;
        }

        var isBrowser = request.Headers.Accept.Any(a => a?.Contains("text/html") == true)
            || request.HasFormContentType;


        try
        {
            if (!string.IsNullOrWhiteSpace(validationId))
            {
                var transaction = await paymentService.ProcessCallbackAsync(new PaymentCallbackRequest(validationId), ct);
                if (isBrowser)
                {
                    return Results.Redirect(storefront.Value.Link($"payment/return?order={transaction.OrderId}&payment=success"));
                }
                return TypedResults.Ok(new { transaction.OrderId, transaction.Status, message = "Payment verified. You can return to your order." });
            }

            if (isBrowser)
            {
                var outcome = status?.ToUpperInvariant() switch
                {
                    "CANCELLED" => "cancelled",
                    _ => "failed"
                };
                return Results.Redirect(storefront.Value.Link($"payment/return?payment={outcome}"));
            }

            return TypedResults.BadRequest(new { error = "missing_val_id", message = "No validation identifier provided." });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            if (isBrowser)
            {
                return Results.Redirect(storefront.Value.Link("payment/return?payment=error"));
            }
            throw;
        }
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
