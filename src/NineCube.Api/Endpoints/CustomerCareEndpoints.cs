using System.Data;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record CreateServiceCaseRequest(int OrderId, ServiceCaseKind Kind, string Message);
public sealed record UpdateServiceCaseRequest(ServiceCaseStatus Status, string Response);
public sealed record DeliveryUpdateRequest(OrderStatus Status, string? Carrier, string? TrackingNumber);
public sealed record CourierWebhookRequest(string? TrackingCode, string? ConsignmentId, string? Status, string? Message);

public sealed class CustomerCareEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/service-cases").RequireAuthorization(Policies.CustomerStaffOrAdmin);
        group.MapGet("/", async (IAppDbContext db, ICurrentUser user, CancellationToken ct) =>
        {
            var query = db.ServiceCases.AsNoTracking();
            if (user.Role == UserRole.Customer) query = query.Where(c => c.CustomerId == user.CustomerId);
            return Results.Ok(await query.OrderByDescending(c => c.CreatedAt).Take(100)
                .Select(c => new { c.Id, c.OrderId, c.Kind, c.Status, c.Message, c.Response, c.CreatedAt, c.UpdatedAt }).ToListAsync(ct));
        });
        group.MapPost("/", async (CreateServiceCaseRequest request, IAppDbContext db, ICurrentUser user, IClock clock, CancellationToken ct) =>
        {
            if (!Enum.IsDefined(request.Kind) || string.IsNullOrWhiteSpace(request.Message) || request.Message.Length > 2000)
                throw new BusinessValidationException("Choose a request type and enter a message of at most 2000 characters.");
            var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CustomerId == user.CustomerId, ct)
                ?? throw new NotFoundException("Order was not found.");
            if (request.Kind is ServiceCaseKind.Return or ServiceCaseKind.Exchange)
                throw new BusinessValidationException("Select returned items from the order details page.");
            var entry = new ServiceCase { OrderId = order.Id, CustomerId = order.CustomerId, Kind = request.Kind,
                Message = request.Message.Trim(), CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow };
            db.ServiceCases.Add(entry);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { entry.Id });
        }).RequireAuthorization(Policies.CustomerOnly).RequireRateLimiting("checkout");
        group.MapPut("/{id:int}", async (int id, UpdateServiceCaseRequest request, IAppDbContext db, ICurrentUser user, IClock clock, CancellationToken ct) =>
        {
            if (!Enum.IsDefined(request.Status) || string.IsNullOrWhiteSpace(request.Response) || request.Response.Length > 2000)
                throw new BusinessValidationException("Enter a response of at most 2000 characters.");
            var entry = await db.ServiceCases.FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw new NotFoundException("Request was not found.");
            if (entry.Status is ServiceCaseStatus.Completed or ServiceCaseStatus.Rejected)
                throw new ResourceConflictException("This request has already been closed.");
            if (entry.Kind is ServiceCaseKind.Return or ServiceCaseKind.Exchange && request.Status is ServiceCaseStatus.Completed or ServiceCaseStatus.Received)
                throw new BusinessValidationException("Use return inspection and refund settlement to complete a return.");
            entry.Status = request.Status;
            entry.Response = request.Response.Trim();
            entry.UpdatedAt = clock.UtcNow;
            db.AuditLogs.Add(new AuditLog { UserId = user.UserId, Action = "service_case.updated", EntityType = nameof(ServiceCase),
                EntityId = id.ToString(), CreatedAt = clock.UtcNow, Details = request.Status.ToString() });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization(Policies.StaffOrAdmin);

        app.MapPost("/api/orders/{id:int}/delivery", async (int id, DeliveryUpdateRequest request, IAppDbContext db,
            INotificationWriter notifications, ICurrentUser user, IClock clock, CancellationToken ct) =>
        {
            if (request.Status is not (OrderStatus.Shipped or OrderStatus.Delivered or OrderStatus.DeliveryFailed)
                || request.Carrier?.Length > 100 || request.TrackingNumber?.Length > 100)
                throw new BusinessValidationException("Choose a delivery status and use at most 100 characters for carrier and tracking number.");
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == id, ct) ?? throw new NotFoundException("Order was not found.");
            if (request.Status == OrderStatus.Shipped && order.PaymentMethod != PaymentMethod.CashOnDelivery && order.PaymentStatus != PaymentStatus.Paid)
                throw new ResourceConflictException("Verify online payment before shipping this order.", "payment_required");
            if (order.Status != request.Status && !OrderStatusRules.CanTransition(order.Status, request.Status))
                throw new InvalidStateTransitionException(order.Status, request.Status);
            if (string.IsNullOrWhiteSpace(request.Carrier) || string.IsNullOrWhiteSpace(request.TrackingNumber))
                throw new BusinessValidationException("Enter the carrier and tracking number.");
            order.Status = request.Status;
            if (request.Status == OrderStatus.Delivered) order.DeliveredAt ??= clock.UtcNow;
            order.Carrier = request.Carrier.Trim();
            order.TrackingNumber = request.TrackingNumber.Trim();
            order.UpdatedAt = clock.UtcNow;

            db.AuditLogs.Add(new AuditLog { UserId = user.UserId, Action = "order.delivery_updated", EntityType = nameof(Order),
                EntityId = id.ToString(), CreatedAt = clock.UtcNow, Details = $"status={request.Status}; carrier={order.Carrier}; tracking={order.TrackingNumber}" });

            var userIds = await db.Users.AsNoTracking()
                .Where(u => u.IsActive && u.CustomerId == order.CustomerId)
                .Select(u => u.Id)
                .ToListAsync(ct);

            var title = $"Order #{order.Id} {request.Status.ToString().ToLowerInvariant()}";
            var body = request.Status switch
            {
                OrderStatus.Delivered => $"Your order #{order.Id} has been successfully delivered. Thank you for shopping with NineCube!",
                OrderStatus.DeliveryFailed => $"Delivery attempt for order #{order.Id} was unsuccessful. Our support team will reach out to reschedule.",
                OrderStatus.Shipped => $"Order #{order.Id} has shipped via {order.Carrier} (Tracking: {order.TrackingNumber}).",
                _ => $"Order #{order.Id} is now {request.Status}."
            };

            foreach (var userId in userIds)
            {
                notifications.Add(userId, NotificationType.OrderStatusChanged, title, body, $"/orders/{order.Id}");
            }

            var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == order.CustomerId, ct);
            if (customer is not null && !string.IsNullOrWhiteSpace(customer.Email))
            {
                db.EmailDeliveries.Add(new EmailDelivery
                {
                    Key = $"delivery-status:{order.Id}:{request.Status.ToString().ToLowerInvariant()}:{clock.UtcNow.Ticks}",
                    Recipient = customer.Email,
                    Subject = title,
                    Body = $"<p>{System.Net.WebUtility.HtmlEncode(body)}</p><p>Carrier: <strong>{System.Net.WebUtility.HtmlEncode(order.Carrier)}</strong><br/>Tracking: <strong>{System.Net.WebUtility.HtmlEncode(order.TrackingNumber)}</strong></p>",
                    CreatedAt = clock.UtcNow
                });
            }

            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization(Policies.StaffOrAdmin);

        // No courier is configured. Never accept unauthenticated status changes.
        app.MapPost("/api/courier/webhook", () => Results.Problem(
            statusCode: 503, title: "Courier integration is not configured."))
            .RequireAuthorization(Policies.AdministratorOnly).WithName("CourierWebhook");
    }
}
