using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using System.Text.Json;
using System.Text.Json.Serialization;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

[CollectionDefinition(ApiCollection.Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "ninecube-api";
}

/// <summary>
/// Base class for the integration tests. Every test starts from an empty database, and every
/// request goes through the real HTTP pipeline.
/// </summary>
[Collection(ApiCollection.Name)]
public abstract class ApiTestBase : IAsyncLifetime
{
    protected static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    protected const string ValidPassword = "Str0ng!Passw0rd";

    protected ApiFactory Factory { get; }
    protected TestDatabase Database => Factory.Database;
    protected HttpClient Client { get; private set; } = null!;

    protected ApiTestBase(ApiFactory factory) => Factory = factory;

    public async Task InitializeAsync()
    {
        Client = Factory.CreateClient();
        await Factory.ResetDatabaseAsync();
    }

    public Task DisposeAsync()
    {
        Client.Dispose();
        Client = null!;
        return Task.CompletedTask;
    }

    // ------------------------------------------------------------------ data setup

    protected Task<Product> SeedProductAsync(string sku, decimal price, int stock, bool isActive = true) =>
        Factory.SeedProductAsync(sku, price, stock, isActive);

    protected Task<User> SeedUserAsync(string email, UserRole role) =>
        Factory.SeedUserAsync(email, ValidPassword, role);

    // ------------------------------------------------------------------ auth

    protected async Task<AuthResponse> RegisterCustomerAsync(string email, string name = "Test Customer")
    {
        var response = await Client.PostAsJsonAsync("api/auth/register",
            new RegisterRequest(email, ValidPassword, name), Json);

        response.StatusCode.Should().Be(
            System.Net.HttpStatusCode.Created,
            "registration should succeed for a fresh email: {0}", await response.Content.ReadAsStringAsync());

        return (await response.Content.ReadFromJsonAsync<AuthResponse>(Json))!;
    }

    protected async Task<AuthResponse> LoginAsync(string email, string password)
    {
        var response = await Client.PostAsJsonAsync("api/auth/login", new LoginRequest(email, password), Json);

        response.StatusCode.Should().Be(
            System.Net.HttpStatusCode.OK,
            "login should succeed for {0}: {1}", email, await response.Content.ReadAsStringAsync());

        return (await response.Content.ReadFromJsonAsync<AuthResponse>(Json))!;
    }

    /// <summary>Creates a user with the given role directly and returns a logged-in token for them.</summary>
    protected async Task<(User User, string Token)> SeedAndLoginAsync(string email, UserRole role)
    {
        var user = await SeedUserAsync(email, role);
        var auth = await LoginAsync(user.Email, ValidPassword);
        return (user, auth.AccessToken);
    }

    // ------------------------------------------------------------------ http helpers

    protected static HttpRequestMessage Request(HttpMethod method, string url, object? body, string? token = null, string? idempotencyKey = null)
    {
        var request = new HttpRequestMessage(method, url);

        if (body is not null)
            request.Content = JsonContent.Create(body, options: Json);

        if (token is not null)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        if (idempotencyKey is not null)
            request.Headers.Add("Idempotency-Key", idempotencyKey);

        return request;
    }

    protected Task<HttpResponseMessage> GetAsync(string url, string? token = null) =>
        Client.SendAsync(Request(HttpMethod.Get, url, null, token));

    protected Task<HttpResponseMessage> PostAsync(string url, object? body, string? token = null, string? idempotencyKey = null) =>
        Client.SendAsync(Request(HttpMethod.Post, url, body, token, idempotencyKey));

    protected Task<HttpResponseMessage> PutAsync(string url, object? body, string? token = null) =>
        Client.SendAsync(Request(HttpMethod.Put, url, body, token));

    protected Task<HttpResponseMessage> DeleteAsync(string url, string? token = null) =>
        Client.SendAsync(Request(HttpMethod.Delete, url, null, token));

    protected static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadAsStringAsync();
        var value = JsonSerializer.Deserialize<T>(payload, Json);
        value.Should().NotBeNull("response body should deserialize into {0}: {1}", typeof(T).Name, payload);
        return value!;
    }

    protected static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<JsonElement>(payload);
    }

    /// <summary>Places an order for the given lines and returns the raw response.</summary>
    protected Task<HttpResponseMessage> PlaceOrderAsync(string token, IEnumerable<(int ProductId, int Quantity)> lines, string? idempotencyKey = null) =>
        PostAsync("api/orders",
            new { items = lines.Select(l => new { productId = l.ProductId, quantity = l.Quantity }).ToArray() },
            token,
            idempotencyKey);
}
