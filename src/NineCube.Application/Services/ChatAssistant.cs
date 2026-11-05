using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

/// <summary>
/// The catalogue-grounded support assistant. A retrieval responder, not a language model: it
/// searches the real Products, Orders and Settings rows of the caller and answers only with what
/// is actually stored. It never states a price, stock figure, model name, certification or
/// delivery promise that did not come out of the database in the same request, and when it finds
/// nothing it says so and offers the human team instead of guessing.
/// </summary>
public sealed partial class ChatAssistant(IAppDbContext db, ICurrentUser currentUser) : IChatAssistant
{
    /// <summary>Words that carry no catalogue meaning on their own, including the order/policy cue
    /// words so "where is my order" never becomes a product search for "order".</summary>
    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "i", "me", "my", "we", "us", "you", "your", "a", "an", "the", "is", "are", "was", "were", "be", "been",
        "do", "does", "did", "have", "has", "had", "of", "to", "in", "on", "at", "for", "with", "and", "or",
        "what", "which", "who", "how", "when", "where", "why", "can", "could", "would", "should", "please",
        "hi", "hello", "hey", "there", "here", "about", "tell", "know", "want", "need", "looking", "find",
        "search", "show", "any", "some", "from", "into", "it", "its", "this", "that", "these", "those",
        "price", "prices", "cost", "costs", "buy", "purchase", "order", "orders", "status", "delivery",
        "shipping", "ship", "return", "returns", "refund", "refunds", "warranty", "exchange", "policy",
        "policies", "privacy", "terms", "available", "availability", "stock", "out", "mine", "check",
        "track", "tracking", "placed", "support", "help"
    };

    private static readonly string[] OrderCues = ["order", "delivery status", "where is my"];

    private static readonly string[] ReturnCues = ["return", "returns", "refund", "refunds", "warranty", "exchange"];
    private static readonly string[] DeliveryCues = ["delivery", "shipping", "courier", "freight"];

    private static readonly Dictionary<string, (string Title, string Link)> PolicyLinks = new()
    {
        [SettingKeys.PolicyDelivery] = ("Delivery & shipping policy", "/policies/delivery"),
        [SettingKeys.PolicyReturns] = ("Returns, exchanges & warranty policy", "/policies/returns"),
        [SettingKeys.PolicyPrivacy] = ("Privacy policy", "/policies/privacy"),
        [SettingKeys.PolicyTerms] = ("Order terms", "/policies/terms")
    };

    public async Task<ChatAssistantAnswer> AnswerAsync(string question, CancellationToken ct = default)
    {
        var normalized = question.Trim().ToLowerInvariant();
        var words = MeaningfulWords(normalized);
        var references = ReferenceNumbers(normalized);
        var hasOrderCue = OrderCues.Any(normalized.Contains);

        if (hasOrderCue || references.Count > 0)
        {
            var orders = await OrdersAnswerAsync(references, hasOrderCue, ct);
            if (orders is not null) return orders;
        }

        if (HasPolicyIntent(normalized))
        {
            var policy = await PolicyAnswerAsync(normalized, ct);
            if (policy is not null) return policy;
        }

        var products = await ProductAnswerAsync(words, ct);
        if (products is not null) return products;

        return HonestFallback();
    }

    // ------------------------------------------------------------------ products

    private async Task<ChatAssistantAnswer?> ProductAnswerAsync(List<string> words, CancellationToken ct)
    {
        if (words.Count == 0) return null;

        // Same containment search the catalogue endpoints use (CatalogSearch alias groups), but
        // OR-ed across the question's words so a conversational sentence still finds its product.
        var products = await db.Products.AsNoTracking()
            .Where(p => p.IsActive && p.ParentProductId == null
                && words.Any(w => p.Name.ToLower().Contains(w)))
            .OrderBy(p => p.Id)
            .Take(5)
            .ToListAsync(ct);

        if (products.Count < 5)
        {
            var taken = products.Select(p => p.Id).ToList();
            products.AddRange(await db.Products.AsNoTracking()
                .Where(p => p.IsActive && p.ParentProductId == null && !taken.Contains(p.Id)
                    && words.Any(w => p.Sku.ToLower().Contains(w)
                        || (p.Brand != null && p.Brand.Name.ToLower().Contains(w))
                        || p.Categories.Any(c => c.Category.Name.ToLower().Contains(w))
                        || p.Tags.Any(t => t.Tag.Name.ToLower().Contains(w))))
                .OrderBy(p => p.Id)
                .Take(5 - products.Count)
                .ToListAsync(ct));
        }

        if (products.Count == 0) return null;

        var lines = products.Select(p => $"- {p.Name}: {Money(p)} ({Availability(p)}).");
        var reply = $"I found {products.Count} catalogue {(products.Count == 1 ? "product" : "products")} matching your question:\n"
            + string.Join("\n", lines);

        return new ChatAssistantAnswer(reply, products
            .Select(p => new ChatAssistantMatchDto("product", p.Id, p.Name, $"{Money(p)} - {Availability(p)}", $"/products/{p.Id}"))
            .ToArray());
    }

    /// <summary>Price and currency exactly as stored. Never rounded, converted or estimated.</summary>
    private static string Money(Product p) => $"{p.Currency} {p.Price.ToString("N2", CultureInfo.InvariantCulture)}";

    /// <summary>Availability exactly as stored; the stored stock number is only stated when there is stock.</summary>
    private static string Availability(Product p) =>
        p.StockQuantity > 0 ? $"in stock, {p.StockQuantity} available" : "currently out of stock";

    // ------------------------------------------------------------------ orders

    private async Task<ChatAssistantAnswer?> OrdersAnswerAsync(List<int> references, bool hasOrderCue, CancellationToken ct)
    {
        if (currentUser.CustomerId is not int customerId)
        {
            // A staff session has no personal orders; nothing is looked up and nothing is shown.
            return hasOrderCue
                ? new ChatAssistantAnswer(
                    "I can only look up orders for the customer account you are signed in with, and this session is not linked to one. Send a message in the chat and our support team will look into any order.",
                    [])
                : null;
        }

        // Always scoped to the caller's own customer id - another customer's order can never appear.
        var query = db.Orders.AsNoTracking().Where(o => o.CustomerId == customerId);
        if (references.Count > 0) query = query.Where(o => references.Contains(o.Id));

        var orders = await query.OrderByDescending(o => o.CreatedAt).Take(5).ToListAsync(ct);
        if (orders.Count == 0)
        {
            // A bare number ("under 2000 taka") may not have been an order reference at all, so
            // only an explicit order phrase gets the definitive "nothing found" answer.
            return hasOrderCue
                ? new ChatAssistantAnswer(
                    "I could not find any matching order on your account. Orders appear here once they are placed. Send a message in the chat and our support team will help you track it down.",
                    [])
                : null;
        }

        var lines = orders.Select(o =>
        {
            var line = $"- Order #{o.Id}: {o.Status}, placed {o.CreatedAt:yyyy-MM-dd}";
            if (o.PaidAt is DateTime paid) line += $", paid {paid:yyyy-MM-dd}";
            if (o.DeliveredAt is DateTime delivered) line += $", delivered {delivered:yyyy-MM-dd}";
            if (!string.IsNullOrWhiteSpace(o.Carrier)) line += $", carrier {o.Carrier}";
            if (!string.IsNullOrWhiteSpace(o.TrackingNumber)) line += $", tracking {o.TrackingNumber}";
            return line + ".";
        });

        return new ChatAssistantAnswer(
            "Here is what I found on your account:\n" + string.Join("\n", lines),
            orders.Select(o => new ChatAssistantMatchDto(
                "order", o.Id, $"Order #{o.Id}",
                $"{o.Status}, placed {o.CreatedAt:yyyy-MM-dd}" + (o.DeliveredAt is DateTime d ? $", delivered {d:yyyy-MM-dd}" : ""),
                "/orders")).ToArray());
    }

    // ------------------------------------------------------------------ policies

    private static bool HasPolicyIntent(string normalized) =>
        normalized.Contains("policy") || normalized.Contains("policies") || normalized.Contains("privacy")
        || normalized.Contains("terms") || ReturnCues.Any(normalized.Contains) || DeliveryCues.Any(normalized.Contains);

    /// <summary>Answers strictly by quoting policy text already stored in the Settings table.
    /// Returns null when nothing is stored, so the assistant falls back honestly instead of inventing terms.</summary>
    private async Task<ChatAssistantAnswer?> PolicyAnswerAsync(string normalized, CancellationToken ct)
    {
        var keys = new List<string>();
        if (normalized.Contains("privacy")) keys.Add(SettingKeys.PolicyPrivacy);
        if (normalized.Contains("terms")) keys.Add(SettingKeys.PolicyTerms);
        if (ReturnCues.Any(normalized.Contains)) keys.Add(SettingKeys.PolicyReturns);
        if (DeliveryCues.Any(normalized.Contains)) keys.Add(SettingKeys.PolicyDelivery);
        // A generic "policy" question gets the two shopping policies shoppers ask about most.
        if (keys.Count == 0)
        {
            keys.Add(SettingKeys.PolicyDelivery);
            keys.Add(SettingKeys.PolicyReturns);
        }

        keys = keys.Distinct().ToList();
        var stored = await db.Settings.AsNoTracking()
            .Where(s => keys.Contains(s.Key))
            .ToListAsync(ct);
        if (stored.Count == 0) return null;

        var reply = string.Join("\n\n", stored
            .OrderBy(s => keys.IndexOf(s.Key))
            .Select(s => $"From our {PolicyLinks[s.Key].Title}: \"{s.Value}\""));

        return new ChatAssistantAnswer(reply, stored
            .OrderBy(s => keys.IndexOf(s.Key))
            .Select(s => new ChatAssistantMatchDto(
                "policy", null, PolicyLinks[s.Key].Title,
                s.Value.Length <= 200 ? s.Value : s.Value[..200],
                PolicyLinks[s.Key].Link))
            .ToArray());
    }

    // ------------------------------------------------------------------ fallback

    private static ChatAssistantAnswer HonestFallback() => new(
        "I could not find an answer to that in our catalogue, your orders or our stored store policies - I only report what is actually in the NineCube database and never guess. Send a message in the chat and one of our human support agents will pick it up.",
        []);

    // ------------------------------------------------------------------ parsing

    /// <summary>The question's catalogue-meaningful words, run through the same alias table the
    /// catalogue search uses so Bangla terms match their English product names.</summary>
    private static List<string> MeaningfulWords(string normalized) =>
        CatalogSearch.Terms(normalized)
            .SelectMany(group => group)
            .Where(w => w.Length >= 2 && !StopWords.Contains(w))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToList();

    /// <summary>Numeric order references inside the question, e.g. "order 1042" or "#1042".</summary>
    private static List<int> ReferenceNumbers(string normalized) =>
        [.. NumberRegex().Matches(normalized).Select(m => m.Value)
            .Where(v => v.Length is >= 1 and <= 9 && int.TryParse(v, out var id) && id > 0)
            .Select(int.Parse)
            .Distinct()
            .Take(5)];

    [GeneratedRegex(@"\d+")]
    private static partial Regex NumberRegex();
}
