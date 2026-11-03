using System.Net;
using System.Text;
using Microsoft.Extensions.Configuration;
using NineCube.Application.Services;
using NineCube.Domain;
using NineCube.Infrastructure.Payments;

namespace NineCube.Tests;

public sealed class SslCommerzGatewayTests
{
    [Theory]
    [InlineData(2499, "BDT", 60)]
    [InlineData(2500, "BDT", 0)]
    [InlineData(2501, "BDT", 0)]
    [InlineData(100, "USD", 0)]
    public void DeliveryFeeRespectsCurrencyAndThreshold(decimal subtotal, string currency, decimal expected) =>
        Assert.Equal(expected, DeliveryPricing.Fee(subtotal, currency));

    [Fact]
    public async Task UnconfiguredGatewayCannotCreatePayment()
    {
        var gateway = new SslCommerzGateway(new HttpClient(new FakeHandler("{}")), new ConfigurationBuilder().Build());
        Assert.False(gateway.IsConfigured);
        await Assert.ThrowsAsync<ResourceConflictException>(() => gateway.CreateSessionAsync(new Order(), "reference", default));
    }

    [Fact]
    public async Task SessionUsesServerOrderAmountAndReturnsHostedCheckout()
    {
        var handler = new FakeHandler("""{"status":"SUCCESS","GatewayPageURL":"https://sandbox.sslcommerz.com/EasyCheckOut/test"}""");
        var gateway = Gateway(handler);
        var result = await gateway.CreateSessionAsync(new Order { Id = 12, TotalAmount = 1234.56m, Currency = "BDT", Customer = new Customer { Name = "Buyer", Email = "buyer@example.test", Phone = "01700000000" } }, "server-reference", default);
        Assert.StartsWith("https://sandbox.sslcommerz.com/", result.RedirectUrl);
        Assert.Contains("total_amount=1234.56", handler.Body);
        Assert.Contains("tran_id=server-reference", handler.Body);
    }

    [Theory]
    [InlineData("https://example.test/steal")]
    [InlineData("https://sslcommerz.com.example.test/steal")]
    [InlineData("http://sandbox.sslcommerz.com/checkout")]
    public async Task SessionRejectsUntrustedRedirects(string url)
    {
        var gateway = Gateway(new FakeHandler($"{{\"status\":\"SUCCESS\",\"GatewayPageURL\":\"{url}\"}}"));
        await Assert.ThrowsAsync<ResourceConflictException>(() => gateway.CreateSessionAsync(new Order { Currency = "BDT", TotalAmount = 100 }, "ref", default));
    }

    [Theory]
    [InlineData("VALID", "0", true, false)]
    [InlineData("VALIDATED", "0", true, false)]
    [InlineData("FAILED", "0", false, false)]
    [InlineData("VALID", "1", true, true)]
    public async Task VerificationReadsProviderStatusAmountAndRisk(string status, string risk, bool paid, bool review)
    {
        var gateway = Gateway(new FakeHandler($"{{\"status\":\"{status}\",\"risk_level\":\"{risk}\",\"tran_id\":\"ref\",\"amount\":\"1450.50\",\"currency\":\"BDT\"}}"));
        var result = await gateway.VerifyAsync("validation-id", default);
        Assert.Equal(1450.50m, result.Amount);
        Assert.Equal("ref", result.Reference);
        Assert.Equal(paid, result.IsPaid);
        Assert.Equal(review, result.NeedsReview);
    }

    private static SslCommerzGateway Gateway(FakeHandler handler) => new(new HttpClient(handler), new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Payments:SslCommerz:StoreId"] = "test-store",
        ["Payments:SslCommerz:StorePassword"] = "test-only",
        ["Payments:SslCommerz:CallbackUrl"] = "https://api.example.test/api/payments/callback"
    }).Build());

    private sealed class FakeHandler(string response) : HttpMessageHandler
    {
        public string Body { get; private set; } = "";
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(response, Encoding.UTF8, "application/json") };
        }
    }
}
