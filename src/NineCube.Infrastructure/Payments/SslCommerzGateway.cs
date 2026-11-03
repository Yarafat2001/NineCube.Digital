using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Infrastructure.Payments;

public sealed class SslCommerzGateway(HttpClient client, IConfiguration configuration) : IPaymentGateway
{
    private string StoreId => configuration["Payments:SslCommerz:StoreId"] ?? "";
    private string Password => configuration["Payments:SslCommerz:StorePassword"] ?? "";
    private string Callback => configuration["Payments:SslCommerz:CallbackUrl"] ?? "";
    private string BaseUrl => configuration["Payments:SslCommerz:Sandbox"] == "false"
        ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(StoreId) && !string.IsNullOrWhiteSpace(Password)
        && Uri.TryCreate(Callback, UriKind.Absolute, out var callback) && callback.Scheme == "https";

    public async Task<GatewaySession> CreateSessionAsync(Order order, string reference, CancellationToken ct)
    {
        EnsureConfigured();
        if (order.Currency != "BDT" || order.TotalAmount is < 10 or > 500000)
            throw new BusinessValidationException("Online checkout supports BDT amounts from 10 to 500,000.");
        if (reference.Length > 30) throw new BusinessValidationException("Gateway transaction reference is too long.");
        Dictionary<string, string?> address = [];
        if (!string.IsNullOrWhiteSpace(order.DeliveryAddressJson))
            address = JsonSerializer.Deserialize<Dictionary<string, string?>>(order.DeliveryAddressJson) ?? [];
        var fields = new Dictionary<string, string>
        {
            ["store_id"] = StoreId, ["store_passwd"] = Password,
            ["total_amount"] = order.TotalAmount.ToString("0.00", CultureInfo.InvariantCulture),
            ["currency"] = order.Currency, ["tran_id"] = reference,
            ["success_url"] = Callback, ["fail_url"] = Callback, ["cancel_url"] = Callback, ["ipn_url"] = Callback,
            ["cus_name"] = Limit(order.Customer?.Name ?? "Customer", 50), ["cus_email"] = order.Customer?.Email ?? "",
            ["cus_add1"] = Limit(address.GetValueOrDefault("AddressLine") ?? "", 50),
            ["cus_city"] = Limit(address.GetValueOrDefault("District") ?? "", 50), ["cus_country"] = "Bangladesh",
            ["cus_phone"] = order.Customer?.Phone ?? "", ["shipping_method"] = "NO",
            ["emi_option"] = "0", ["product_name"] = $"NineCube order {order.Id}", ["product_category"] = "Retail", ["product_profile"] = "general"
        };
        using var response = await client.PostAsync($"{BaseUrl}/gwprocess/v4/api.php", new FormUrlEncodedContent(fields), ct);
        response.EnsureSuccessStatusCode();
        using var json = await response.Content.ReadFromJsonAsync<JsonDocument>(ct)
            ?? throw new ResourceConflictException("Gateway returned no checkout session.", "gateway_unavailable");
        var root = json.RootElement;
        if (Text(root, "status") != "SUCCESS" || !Uri.TryCreate(Text(root, "GatewayPageURL"), UriKind.Absolute, out var url)
            || url.Scheme != "https" || !(url.Host == "sslcommerz.com" || url.Host.EndsWith(".sslcommerz.com", StringComparison.OrdinalIgnoreCase)))
            throw new ResourceConflictException("Gateway could not create a checkout session.", "gateway_unavailable");
        return new GatewaySession(url.AbsoluteUri);
    }

    public async Task<VerifiedPayment> VerifyAsync(string validationId, CancellationToken ct)
    {
        EnsureConfigured();
        var query = $"val_id={Uri.EscapeDataString(validationId)}&store_id={Uri.EscapeDataString(StoreId)}&store_passwd={Uri.EscapeDataString(Password)}&v=1&format=json";
        using var response = await client.GetAsync($"{BaseUrl}/validator/api/validationserverAPI.php?{query}", ct);
        response.EnsureSuccessStatusCode();
        using var json = await response.Content.ReadFromJsonAsync<JsonDocument>(ct)
            ?? throw new BusinessValidationException("Gateway validation failed.");
        var root = json.RootElement;
        if (!decimal.TryParse(Text(root, "amount"), NumberStyles.Number, CultureInfo.InvariantCulture, out var amount))
            throw new BusinessValidationException("Gateway returned an invalid amount.");
        return new VerifiedPayment(Text(root, "tran_id"), amount, Text(root, "currency"),
            Text(root, "status") is "VALID" or "VALIDATED", Text(root, "risk_level") != "0", Text(root, "bank_tran_id"));
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured) throw new ResourceConflictException("SSLCOMMERZ is not configured.", "gateway_unavailable");
    }
    private static string Text(JsonElement root, string key) => root.TryGetProperty(key, out var value) ? value.ToString() : "";
    private static string Limit(string value, int length) => value.Length > length ? value[..length] : value;
}
