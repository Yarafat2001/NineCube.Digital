using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;

namespace NineCube.Application.Services;

/// <summary>
/// Answers a customer's common support question from the store's own knowledge. Delivery,
/// return, warranty, privacy and terms questions are answered by quoting the policy text stored
/// in Settings - never by stating a promise that is not stored. A greeting gets a fixed reply
/// that says exactly what the automated helper can and cannot do. Everything else returns null
/// so the message waits for a human agent.
/// </summary>
public sealed class SupportAutoResponder(IAppDbContext db) : ISupportAutoResponder
{
    private static readonly Regex GreetingRegex =
        new(@"\b(?:hi|hello|hey|salam|assalamu|good\s+morning|good\s+afternoon|good\s+evening)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly string[] DeliveryCues = ["deliver", "shipping", "ship", "courier", "freight"];
    private static readonly string[] ReturnCues = ["return", "refund", "warranty", "exchange", "replace"];

    private static readonly Dictionary<string, string> PolicyTitles = new()
    {
        [SettingKeys.PolicyDelivery] = "delivery & shipping policy",
        [SettingKeys.PolicyReturns] = "returns, exchanges & warranty policy",
        [SettingKeys.PolicyPrivacy] = "privacy policy",
        [SettingKeys.PolicyTerms] = "order terms"
    };

    public async Task<string?> AutoReplyAsync(string customerMessage, CancellationToken ct = default)
    {
        var normalized = customerMessage.Trim().ToLowerInvariant();
        if (normalized.Length == 0) return null;

        var keys = new List<string>();
        if (DeliveryCues.Any(normalized.Contains)) keys.Add(SettingKeys.PolicyDelivery);
        if (ReturnCues.Any(normalized.Contains)) keys.Add(SettingKeys.PolicyReturns);
        if (normalized.Contains("privacy")) keys.Add(SettingKeys.PolicyPrivacy);
        if (normalized.Contains("terms")) keys.Add(SettingKeys.PolicyTerms);

        if (keys.Count > 0)
        {
            keys = keys.Distinct().ToList();
            var stored = await db.Settings.AsNoTracking()
                .Where(s => keys.Contains(s.Key))
                .ToListAsync(ct);
            if (stored.Count > 0)
            {
                return string.Join("\n\n", stored
                    .OrderBy(s => keys.IndexOf(s.Key))
                    .Select(s => $"From our {PolicyTitles[s.Key]}:\n{s.Value}"));
            }
        }

        if (GreetingRegex.IsMatch(customerMessage))
            return "Hello, and welcome to NineCube support. Ask me about delivery, returns or our policies and I answer right away from the store's own information; anything else goes straight to the support team.";

        return null;
    }
}
