using System.Data;
using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record CreateServiceCaseRequest(int OrderId, ServiceCaseKind Kind, string Message);
public sealed record UpdateServiceCaseRequest(ServiceCaseStatus Status, string Response);
public sealed record DeliveryUpdateRequest(OrderStatus Status, string? Carrier, string? TrackingNumber);

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
            if (request.Kind is ServiceCaseKind.Return or ServiceCaseKind.Exchange && order.Status != OrderStatus.Delivered)
                throw new BusinessValidationException("Returns and exchanges can be requested after delivery.");
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
            entry.Status = request.Status;
            entry.Response = request.Response.Trim();
            entry.UpdatedAt = clock.UtcNow;
            db.AuditLogs.Add(new AuditLog { UserId = user.UserId, Action = "service_case.updated", EntityType = nameof(ServiceCase),
                EntityId = id.ToString(), CreatedAt = clock.UtcNow, Details = request.Status.ToString() });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization(Policies.StaffOrAdmin);

        app.MapPost("/api/orders/{id:int}/delivery", async (int id, DeliveryUpdateRequest request, IAppDbContext db,
            ICurrentUser user, IClock clock, CancellationToken ct) =>
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
            order.Carrier = request.Carrier.Trim();
            order.TrackingNumber = request.TrackingNumber.Trim();
            order.UpdatedAt = clock.UtcNow;
            db.AuditLogs.Add(new AuditLog { UserId = user.UserId, Action = "order.delivery_updated", EntityType = nameof(Order),
                EntityId = id.ToString(), CreatedAt = clock.UtcNow, Details = $"status={request.Status}; carrier={order.Carrier}; tracking={order.TrackingNumber}" });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization(Policies.StaffOnly);
    }
}
