using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Infrastructure.Persistence;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

public sealed class CommerceHttpTests(CommerceHttpFixture fixture) : IClassFixture<CommerceHttpFixture>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };
    [Fact]
    public async Task SavedAddressesRoundTripInternationalFieldsAndKeepExactlyOneDefault()
    {
        var email = $"address-{Guid.NewGuid():N}@example.test";
        const string password = "Address-test-password-123!";
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasherService>();
            db.Users.Add(new User { Email = email, PasswordHash = hasher.Hash(password), Role = UserRole.Customer,
                Customer = new Customer { Name = "Address buyer", Email = email, CreatedAt = DateTime.UtcNow } });
            await db.SaveChangesAsync();
        }
        using var client = fixture.Factory.CreateClient();
        using var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        login.EnsureSuccessStatusCode();
        var auth = (await login.Content.ReadFromJsonAsync<AuthResponse>(JsonOptions))!;
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var uk = new AddressRequest("Work", "", "London", "", "12 Example Street", CountryCode: "GB", PostalCode: "SW1A 1AA",
            RecipientName: "Address buyer", AddressLine2: "Flat 4", Landmark: "Beside the library", DeliveryInstructions: "Call on arrival");
        using var firstResponse = await client.PostAsJsonAsync("/api/me/addresses", uk);
        firstResponse.EnsureSuccessStatusCode();
        var first = (await firstResponse.Content.ReadFromJsonAsync<AddressDto>())!;
        Assert.True(first.IsDefault);
        Assert.Equal("GB", first.CountryCode);
        Assert.Equal("Flat 4", first.AddressLine2);
        Assert.Equal("Call on arrival", first.DeliveryInstructions);
        using var secondResponse = await client.PostAsJsonAsync("/api/me/addresses", new AddressRequest("Home", "Dhaka", "Dhaka", "Unlisted village", "House 42", IsDefault: true));
        secondResponse.EnsureSuccessStatusCode();
        var second = (await secondResponse.Content.ReadFromJsonAsync<AddressDto>())!;
        var addresses = (await client.GetFromJsonAsync<AddressDto[]>("/api/me/addresses"))!;
        Assert.Equal(2, addresses.Length);
        Assert.Equal(second.Id, Assert.Single(addresses, a => a.IsDefault).Id);
        using var unset = await client.PutAsJsonAsync($"/api/me/addresses/{second.Id}", new AddressRequest("Home", "Dhaka", "Dhaka", "Unlisted village", "House 42"));
        unset.EnsureSuccessStatusCode();
        addresses = (await client.GetFromJsonAsync<AddressDto[]>("/api/me/addresses"))!;
        Assert.Single(addresses, a => a.IsDefault);
        using var switchDefault = await client.PutAsJsonAsync($"/api/me/addresses/{first.Id}", uk with { IsDefault = true });
        switchDefault.EnsureSuccessStatusCode();
        using var deleted = await client.DeleteAsync($"/api/me/addresses/{first.Id}");
        deleted.EnsureSuccessStatusCode();
        addresses = (await client.GetFromJsonAsync<AddressDto[]>("/api/me/addresses"))!;
        Assert.True(Assert.Single(addresses).IsDefault);
        using var outsider = await fixture.Client.DeleteAsync($"/api/me/addresses/{second.Id}");
        Assert.Equal(HttpStatusCode.Unauthorized, outsider.StatusCode);
    }

    [Fact]
    public async Task PublicProductDocumentsIncludeStructuredDataAndOnlyActiveProductsAppearInSitemap()
    {
        var product = await fixture.ProductAsync();
        var hidden = await fixture.ProductAsync(false);
        using var document = await fixture.Client.GetAsync($"/shop/products/{product.Slug}");
        document.EnsureSuccessStatusCode();
        var html = await document.Content.ReadAsStringAsync();
        Assert.Contains("application/ld+json", html);
        Assert.Contains("schema.org", html);
        Assert.Contains("rel=\"canonical\"", html);
        var sitemap = await fixture.Client.GetStringAsync("/sitemap.xml");
        Assert.Contains(product.Slug, sitemap);
        Assert.DoesNotContain(hidden.Slug, sitemap);
    }

    [Fact]
    public async Task ChangedQuoteDoesNotCreateAnOrderOrReserveStock()
    {
        var product = await fixture.ProductAsync();
        var session = await GuestAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/guest/orders")
        {
            Content = JsonContent.Create(new { items = new[] { new { productId = product.Id, quantity = 1 } }, addressId = session.AddressId, expectedTotal = 1 })
        };
        request.Headers.Add("X-Guest-Token", session.Token);
        using var response = await fixture.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(2, (await db.Products.FindAsync(product.Id))!.StockQuantity);
    }

    [Fact]
    public async Task UnpaidOnlineReservationExpiresOnceAndRestoresStock()
    {
        var product = await fixture.ProductAsync();
        var session = await GuestAsync();
        var order = await PlaceAsync(new { items = new[] { new { productId = product.Id, quantity = 1 } }, addressId = session.AddressId,
            paymentMethod = "Card" }, session.Token, Guid.NewGuid().ToString());
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Orders.Where(o => o.Id == order.Id).ExecuteUpdateAsync(s => s.SetProperty(o => o.ReservationExpiresAt, DateTime.UtcNow.AddMinutes(-1)));
        var orders = scope.ServiceProvider.GetRequiredService<NineCube.Application.Services.IOrderService>();
        Assert.Equal(1, await orders.ExpireReservationsAsync());
        Assert.Equal(0, await orders.ExpireReservationsAsync());
        Assert.Equal(2, (await db.Products.AsNoTracking().FirstAsync(p => p.Id == product.Id)).StockQuantity);
    }
    [Fact]
    public async Task AnonymousCatalogNeverExposesInactiveProducts()
    {
        var product = await fixture.ProductAsync(false);
        using var response = await fixture.Client.GetAsync($"/api/products/{product.Id}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var gallery = await fixture.Client.GetAsync($"/api/products/{product.Id}/images");
        Assert.Equal(HttpStatusCode.NotFound, gallery.StatusCode);
        using var listing = await fixture.Client.GetAsync("/api/products?isActive=false");
        listing.EnsureSuccessStatusCode();
        var products = await listing.Content.ReadFromJsonAsync<PagedResult<ProductDto>>();
        Assert.DoesNotContain(products!.Items, p => p.Id == product.Id);
    }

    [Fact]
    public async Task QuoteAndGuestOrderAgreeOnDeliveryAndRetryDoesNotReserveTwice()
    {
        var product = await fixture.ProductAsync();
        var session = await GuestAsync();
        var body = new { items = new[] { new { productId = product.Id, quantity = 1 } }, addressId = session.AddressId, deliveryInstructions = "Call before delivery" };
        using var quoteResponse = await fixture.Client.PostAsJsonAsync("/api/checkout/quote", body);
        quoteResponse.EnsureSuccessStatusCode();
        var quote = await quoteResponse.Content.ReadFromJsonAsync<JsonElement>();
        var key = Guid.NewGuid().ToString();
        var first = await PlaceAsync(body, session.Token, key);
        var replay = await PlaceAsync(body, session.Token, key);
        Assert.Equal(first.Id, replay.Id);
        Assert.Equal(1060m, first.TotalAmount);
        Assert.Equal(quote.GetProperty("totalAmount").GetDecimal(), first.TotalAmount);
        Assert.Contains("Dhaka", first.DeliveryAddressJson!);
        Assert.Equal("Call before delivery", first.DeliveryInstructions);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, (await db.Products.FindAsync(product.Id))!.StockQuantity);
        Assert.True(await db.EmailDeliveries.AnyAsync(e => e.Key == $"order-receipt:{first.Id}"));
    }

    [Fact]
    public async Task GuestTokenIsRequiredAndCannotAccessAnotherGuestsOrder()
    {
        var product = await fixture.ProductAsync();
        var owner = await GuestAsync();
        var other = await GuestAsync();
        var order = await PlaceAsync(new { items = new[] { new { productId = product.Id, quantity = 1 } }, addressId = owner.AddressId }, owner.Token, Guid.NewGuid().ToString());
        using var missing = await fixture.Client.GetAsync($"/api/guest/orders/{order.Id}");
        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/guest/orders/{order.Id}");
        request.Headers.Add("X-Guest-Token", other.Token);
        using var response = await fixture.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GuestCannotSelectAnotherCustomersAddress()
    {
        var product = await fixture.ProductAsync();
        var owner = await GuestAsync();
        var other = await GuestAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/guest/orders")
        {
            Content = JsonContent.Create(new { items = new[] { new { productId = product.Id, quantity = 1 } }, addressId = other.AddressId })
        };
        request.Headers.Add("X-Guest-Token", owner.Token);
        using var response = await fixture.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task BrowserLoginKeepsRefreshTokenInSecureHttpOnlyCookie()
    {
        var email = $"buyer-{Guid.NewGuid():N}@example.test";
        const string password = "Test-only-password-123!";
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasherService>();
            db.Users.Add(new User { Email = email, PasswordHash = hasher.Hash(password), Role = UserRole.Customer, IsActive = true,
                Customer = new Customer { Name = "Browser buyer", Email = email, CreatedAt = DateTime.UtcNow } });
            await db.SaveChangesAsync();
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login") { Content = JsonContent.Create(new { email, password }) };
        request.Headers.Add("X-NineCube-Client", "web");
        using var response = await fixture.Client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>(JsonOptions);
        Assert.Null(auth!.RefreshToken);
        var cookie = string.Join(";", response.Headers.GetValues("Set-Cookie")).ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("samesite=none", cookie);
    }

    private async Task<(string Token, int AddressId)> GuestAsync()
    {
        using var response = await fixture.Client.PostAsJsonAsync("/api/guest/session", new { name = "Guest buyer", email = "guest@example.test", phone = "01700000000",
            division = "Dhaka", district = "Dhaka", upazila = "Dhamrai", addressLine = "Test delivery address" });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return (json.GetProperty("token").GetString()!, json.GetProperty("addressId").GetInt32());
    }
    private async Task<OrderDto> PlaceAsync(object body, string token, string key)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/guest/orders") { Content = JsonContent.Create(body) };
        request.Headers.Add("X-Guest-Token", token);
        request.Headers.Add("Idempotency-Key", key);
        using var response = await fixture.Client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<OrderDto>(JsonOptions))!;
    }
}

public sealed class CommerceHttpFixture : IAsyncLifetime
{
    private readonly PostgresTestDatabase _database = new();
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public HttpClient Client { get; private set; } = null!;
    public async Task InitializeAsync()
    {
        await _database.InitializeAsync();
        Factory = new CommerceApiFactory(_database.ConnectionString);
        Client = Factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (!await db.Categories.AnyAsync(c => c.Id == 1))
        {
            db.Categories.Add(new Category { Id = 1, Name = "Catalogue", Slug = "catalogue", Path = "/1/", Depth = 1, IsActive = true });
            await db.SaveChangesAsync();
        }
    }
    public async Task<Product> ProductAsync(bool active = true)
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var product = new Product { Name = "Test product", Sku = Guid.NewGuid().ToString("N"), Price = 1000, Currency = "BDT",
            StockQuantity = 2, IsActive = active, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product;
    }
    public async Task DisposeAsync()
    {
        Client?.Dispose();
        if (Factory is not null) await Factory.DisposeAsync();
        await _database.DisposeAsync();
    }
    private sealed class CommerceApiFactory(string connection) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            var settings = new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = connection, ["Seed:Enabled"] = "false",
                ["Jwt:SigningKey"] = "commerce-http-test-signing-key-only-0123456789",
                ["Jwt:Issuer"] = "CommerceTests", ["Jwt:Audience"] = "CommerceTests",
                ["Payments:SslCommerz:StoreId"] = "", ["Payments:SslCommerz:StorePassword"] = ""
            };
            foreach (var item in settings) builder.UseSetting(item.Key, item.Value);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(settings));
        }
    }
}
