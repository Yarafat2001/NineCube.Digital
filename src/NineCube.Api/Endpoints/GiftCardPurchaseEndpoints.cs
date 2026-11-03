using System.Net.Mail;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record BuyGiftCardRequest(decimal Amount, string RecipientName, string RecipientEmail, string? Note);

public sealed class GiftCardPurchaseEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/gift-card-purchases", async (BuyGiftCardRequest request, IAppDbContext db, ICurrentUser user,
            IPaymentGateway gateway, IClock clock, CancellationToken ct) =>
        {
            if (!gateway.IsConfigured) throw new ResourceConflictException("Gift card purchases will be available when online payments are configured.", "gateway_unavailable");
            if (request.Amount is < 100 or > 50000 || decimal.Round(request.Amount, 2) != request.Amount
                || string.IsNullOrWhiteSpace(request.RecipientName) || request.RecipientName.Length > 200
                || string.IsNullOrWhiteSpace(request.RecipientEmail) || request.RecipientEmail.Length > 256 || !MailAddress.TryCreate(request.RecipientEmail, out _)
                || request.Note?.Length > 1000) throw new BusinessValidationException("Enter an amount from BDT 100 to 50,000 and valid recipient details.");
            if (user.CustomerId is not int customerId) throw new ForbiddenException("A customer account is required.");
            var order = new Order { CustomerId = customerId, Currency = "BDT", SubTotal = request.Amount, TotalAmount = request.Amount,
                CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow, PaymentMethod = PaymentMethod.Card, PaymentStatus = PaymentStatus.Unpaid };
            db.GiftCardPurchases.Add(new GiftCardPurchase { Order = order, RecipientName = request.RecipientName.Trim(), RecipientEmail = request.RecipientEmail.Trim(), Note = request.Note?.Trim() });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { orderId = order.Id, message = "Complete online payment to issue and deliver the gift card." });
        }).RequireAuthorization(Policies.CustomerOnly).RequireRateLimiting("checkout");
    }
}
