using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;
using NineCube.Infrastructure.Identity;

namespace NineCube.Api.Endpoints;

public sealed record GuestSessionRequest(string Name, string Email, string Phone, string Division, string District, string Upazila, string AddressLine);

public sealed class GuestCheckoutEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/guest").AllowAnonymous().RequireRateLimiting("checkout");
        group.MapPost("/session", async (GuestSessionRequest request, IAppDbContext db, IClock clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 200
                || string.IsNullOrWhiteSpace(request.Email) || request.Email.Length > 256 || !MailAddress.TryCreate(request.Email, out _)
                || string.IsNullOrWhiteSpace(request.Phone) || request.Phone.Length > 32
                || string.IsNullOrWhiteSpace(request.AddressLine) || request.AddressLine.Length > 300
                || string.IsNullOrWhiteSpace(request.Division) || request.Division.Length > 80
                || string.IsNullOrWhiteSpace(request.District) || request.District.Length > 80
                || string.IsNullOrWhiteSpace(request.Upazila) || request.Upazila.Length > 80)
                throw new BusinessValidationException("Enter your name, email, phone and complete delivery address.");
            // Never attach anonymous orders to an existing account merely because emails match.
            var customer = new Customer { Name = request.Name.Trim(), Email = request.Email.Trim(), Phone = request.Phone.Trim(), CreatedAt = clock.UtcNow };
            var address = new Address { Customer = customer, Label = "Delivery", Division = request.Division.Trim(), District = request.District.Trim(),
                Upazila = request.Upazila.Trim(), AddressLine = request.AddressLine.Trim(), Phone = request.Phone.Trim(), IsDefault = true };
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            db.Addresses.Add(address);
            db.GuestCheckoutSessions.Add(new GuestCheckoutSession { Customer = customer, TokenHash = Hash(token), ExpiresAt = clock.UtcNow.AddDays(30) });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { token, addressId = address.Id });
        });
        group.MapPost("/orders", async (CreateOrderRequest request, HttpContext http, IAppDbContext db, IClock clock, IOrderService orders, CancellationToken ct) =>
        {
            var original = http.User;
            try
            {
                await IdentifyAsync(http, db, clock, ct);
                var result = await orders.PlaceOrderAsync(request, http.Request.Headers["Idempotency-Key"].FirstOrDefault(), ct);
                return Results.Ok(result.Order);
            }
            finally { http.User = original; }
        });
        group.MapGet("/orders/{id:int}", async (int id, HttpContext http, IAppDbContext db, IClock clock, IOrderService orders, CancellationToken ct) =>
        {
            var original = http.User;
            try { await IdentifyAsync(http, db, clock, ct); return Results.Ok(await orders.GetOrderAsync(id, ct)); }
            finally { http.User = original; }
        });
        group.MapPost("/payments", async (ProcessPaymentRequest request, HttpContext http, IAppDbContext db, IClock clock, IPaymentService payments, CancellationToken ct) =>
        {
            var original = http.User;
            try { await IdentifyAsync(http, db, clock, ct); return Results.Ok(await payments.ProcessPaymentAsync(request, ct)); }
            finally { http.User = original; }
        });
    }

    private static async Task IdentifyAsync(HttpContext http, IAppDbContext db, IClock clock, CancellationToken ct)
    {
        var token = http.Request.Headers["X-Guest-Token"].ToString();
        if (token.Length != 64) throw new UnauthorizedException("Your guest session has expired. Please contact the store for help.");
        var hash = Hash(token);
        var session = await db.GuestCheckoutSessions.AsNoTracking().FirstOrDefaultAsync(s => s.TokenHash == hash && s.ExpiresAt > clock.UtcNow, ct)
            ?? throw new UnauthorizedException("Guest session was not found or has expired.");
        http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("role", "Customer"),
            new Claim(JwtTokenService.CustomerIdClaim, session.CustomerId.ToString()) }, "Guest", "email", "role"));
    }
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
