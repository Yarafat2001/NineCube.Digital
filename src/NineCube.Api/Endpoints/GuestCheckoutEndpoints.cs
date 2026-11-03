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
using NineCube.Application.Validation;

namespace NineCube.Api.Endpoints;

public sealed record GuestSessionRequest(string Name, string Email, string Phone, string Division, string District, string Upazila, string AddressLine,
    string CountryCode = "BD", string? PostalCode = null, string? RecipientName = null, string? Company = null,
    string? AddressLine2 = null, string? Landmark = null, string? DeliveryInstructions = null);

public sealed class GuestCheckoutEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/guest").AllowAnonymous().RequireRateLimiting("checkout");
        group.MapPost("/session", async (GuestSessionRequest request, IAppDbContext db, IClock clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 200
                || string.IsNullOrWhiteSpace(request.Email) || request.Email.Length > 256 || !MailAddress.TryCreate(request.Email, out _)
                || string.IsNullOrWhiteSpace(request.Phone))
                throw new BusinessValidationException("Enter your name, email, phone and complete delivery address.");
            var errors = AddressValidation.Errors(new AddressRequest("Delivery", request.Division, request.District, request.Upazila,
                request.AddressLine, request.Phone, CountryCode: request.CountryCode, PostalCode: request.PostalCode,
                RecipientName: request.RecipientName, Company: request.Company, AddressLine2: request.AddressLine2,
                Landmark: request.Landmark, DeliveryInstructions: request.DeliveryInstructions));
            if (errors.Count > 0) throw new BusinessValidationException("Check your delivery address.", errors);
            // Never attach anonymous orders to an existing account merely because emails match.
            var customer = new Customer { Name = request.Name.Trim(), Email = request.Email.Trim(), Phone = request.Phone.Trim(), CreatedAt = clock.UtcNow };
            var address = new Address { Customer = customer, Label = "Delivery", Division = request.Division?.Trim() ?? "", District = request.District?.Trim() ?? "",
                Upazila = request.Upazila?.Trim() ?? "", AddressLine = request.AddressLine.Trim(), Phone = request.Phone.Trim(), IsDefault = true,
                CountryCode = request.CountryCode.Trim().ToUpperInvariant(), PostalCode = request.PostalCode?.Trim(),
                RecipientName = request.RecipientName?.Trim() ?? request.Name.Trim(), Company = request.Company?.Trim(),
                AddressLine2 = request.AddressLine2?.Trim(), Landmark = request.Landmark?.Trim(), DeliveryInstructions = request.DeliveryInstructions?.Trim() };
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
        group.MapPost("/orders/{id:int}/cancel", async (int id, HttpContext http, IAppDbContext db, IClock clock, IOrderService orders, CancellationToken ct) =>
        {
            var original = http.User;
            try { await IdentifyAsync(http, db, clock, ct); return Results.Ok(await orders.CancelAsync(id, ct)); }
            finally { http.User = original; }
        });
        group.MapPost("/orders/{id:int}/support", async (int id, ReviewReportRequest request, HttpContext http, IAppDbContext db, IClock clock, IOrderService orders, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 2000) throw new BusinessValidationException("Enter a support message of at most 2000 characters.");
            var original = http.User;
            try
            {
                await IdentifyAsync(http, db, clock, ct);
                var order = await orders.GetOrderAsync(id, ct);
                db.ServiceCases.Add(new ServiceCase { OrderId = id, CustomerId = order.CustomerId, Kind = ServiceCaseKind.Support, Message = request.Reason.Trim(), CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow });
                await db.SaveChangesAsync(ct); return Results.NoContent();
            }
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
