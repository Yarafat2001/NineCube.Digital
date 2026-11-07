using System;
using System.Collections.Generic;
using NineCube.Application.Abstractions;

namespace NineCube.Application.Services.Agent;

/// <summary>
/// Server-owned risk classification engine.
/// Client-side or LLM-proposed risk values are untrusted and strictly overridden by this service.
/// </summary>
public sealed class RiskClassificationService : IRiskClassificationService
{
    private static readonly HashSet<string> Tier1Intents = new(StringComparer.OrdinalIgnoreCase)
    {
        "search_products",
        "filter_catalog",
        "compare_specs",
        "compare_products",
        "track_order",
        "get_policy",
        "estimate_delivery",
        "get_product_details",
        "check_inventory"
    };

    private static readonly HashSet<string> Tier2Intents = new(StringComparer.OrdinalIgnoreCase)
    {
        "add_to_cart",
        "update_cart_quantity",
        "update_cart",
        "remove_from_cart",
        "apply_coupon",
        "remove_coupon",
        "add_to_wishlist",
        "remove_from_wishlist",
        "clear_preferences"
    };

    private static readonly HashSet<string> Tier3Intents = new(StringComparer.OrdinalIgnoreCase)
    {
        "prepare_checkout",
        "authorize_payment",
        "capture_payment",
        "modify_security",
        "delete_address",
        "change_password",
        "cancel_order",
        "request_refund"
    };

    public int Classify(string intent)
    {
        if (string.IsNullOrWhiteSpace(intent)) return 3; // Fail-closed

        var normalized = intent.Trim();

        if (Tier1Intents.Contains(normalized)) return 1;
        if (Tier2Intents.Contains(normalized)) return 2;
        if (Tier3Intents.Contains(normalized)) return 3;

        // Fail-closed invariant: Any custom or unrecognized intent defaults to Tier 3
        return 3;
    }

    public bool IsMutation(string intent) => Classify(intent) >= 2;

    public bool IsHighImpact(string intent) => Classify(intent) == 3;

    public string GetCategory(string intent)
    {
        var tier = Classify(intent);
        return tier switch
        {
            1 => "Tier 1: Read-Only / Factual Retrieval",
            2 => "Tier 2: Reversible Storefront Mutation",
            3 => "Tier 3: High-Impact / Financial & Security Guardrail",
            _ => "Tier 3: Unknown Intent (Fail-Closed Default)"
        };
    }
}
