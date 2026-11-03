using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public sealed record CheckoutQuote(decimal SubTotal, decimal DiscountAmount, decimal ShippingAmount,
    decimal GiftCardAmount, decimal TotalAmount, string Currency, decimal FreeShippingThreshold, string? CouponCode);

public static class DeliveryPricing
{
    public const decimal FreeShippingThreshold = 2500m;
    public static decimal Fee(decimal subtotal, string currency) => currency == "BDT" && subtotal < FreeShippingThreshold ? 60m : 0m;
}

public sealed class CheckoutService(IAppDbContext db, ICouponService coupons, IClock clock)
{
    public async Task<CheckoutQuote> QuoteAsync(CreateOrderRequest request, CancellationToken ct)
    {
        if (request.Items is null || request.Items.Count == 0 || request.Items.Count > 200
            || request.Items.Any(i => i.Quantity is < 1 or > 1000))
            throw new BusinessValidationException("Choose between 1 and 200 product lines with quantities from 1 to 1000.");
        var lines = request.Items.GroupBy(i => i.ProductId).Select(g => new { Id = g.Key, Quantity = g.Sum(i => (long)i.Quantity) }).ToList();
        if (lines.Any(l => l.Quantity > 1000)) throw new BusinessValidationException("Maximum quantity per product is 1000.");
        var ids = lines.Select(l => l.Id).ToList();
        var products = await db.Products.AsNoTracking().Where(p => ids.Contains(p.Id) && p.IsActive)
            .Select(p => new { p.Id, p.Price, p.Currency, p.StockQuantity }).ToListAsync(ct);
        if (products.Count != lines.Count) throw new BusinessValidationException("One or more products are unavailable.");
        if (products.Select(p => p.Currency).Distinct().Count() != 1) throw new BusinessValidationException("Use one currency per order.");
        var currency = products[0].Currency;
        var subtotal = lines.Sum(l => products.Single(p => p.Id == l.Id).Price * l.Quantity);
        var items = lines.Select(l => new CartLineItemDto(l.Id, (int)l.Quantity, products.Single(p => p.Id == l.Id).Price)).ToList();
        var evaluation = await coupons.EvaluateCartPromotionsAsync(new EvaluateCartPromotionsRequest(subtotal, items, request.CouponCode), ct);
        if (!string.IsNullOrWhiteSpace(request.CouponCode) && evaluation.ManualDiscount?.IsValid != true)
            throw new BusinessValidationException(evaluation.ManualDiscount?.Reason ?? "Coupon is unavailable.");
        var discount = evaluation.TotalDiscountAmount;
        var shipping = DeliveryPricing.Fee(subtotal, currency);
        var payable = Math.Max(0, subtotal - discount) + shipping;
        var gift = 0m;
        if (!string.IsNullOrWhiteSpace(request.GiftCardCode))
        {
            var code = request.GiftCardCode.Trim().ToUpperInvariant();
            var card = await db.GiftCards.AsNoTracking().FirstOrDefaultAsync(g => g.Code == code && g.IsActive, ct);
            if (card is null || card.Currency != currency || card.CurrentBalance <= 0 || card.ExpiresAt <= clock.UtcNow)
                throw new BusinessValidationException("Gift card is unavailable for this order.");
            gift = Math.Min(payable, card.CurrentBalance);
        }
        return new(subtotal, discount, shipping, gift, payable - gift, currency, DeliveryPricing.FreeShippingThreshold, evaluation.EffectiveDiscount?.Code);
    }
}
