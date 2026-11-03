using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record ReturnItemRequest(int OrderItemId, int Quantity);
public sealed record ReturnRequest(ServiceCaseKind Kind, string Reason, IReadOnlyList<ReturnItemRequest> Items);
public sealed record InspectReturnLine(int Id, int ReceivedQuantity, int RestockQuantity);
public sealed record InspectReturnRequest(string Response, IReadOnlyList<InspectReturnLine> Items);

public sealed class ReturnsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/orders/{id:int}/returns", async (int id, IAppDbContext db, ICurrentUser caller, IConfiguration config, CancellationToken ct) =>
        {
            var order = await db.Orders.AsNoTracking().Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id && (caller.Role != UserRole.Customer || o.CustomerId == caller.CustomerId), ct)
                ?? throw new NotFoundException("Order was not found.");
            var cases = await db.ServiceCases.AsNoTracking().Where(c => c.OrderId == id && (c.Kind == ServiceCaseKind.Return || c.Kind == ServiceCaseKind.Exchange)).ToListAsync(ct);
            var caseIds = cases.Where(c => c.Status != ServiceCaseStatus.Rejected).Select(c => c.Id).ToArray();
            var lines = await db.ReturnLines.AsNoTracking().Where(l => caseIds.Contains(l.ServiceCaseId)).ToListAsync(ct);
            var windowDays = config.GetValue<int?>("Returns:WindowDays");
            return Results.Ok(new { cases, lines, deadline = windowDays is > 0 && order.DeliveredAt.HasValue ? order.DeliveredAt.Value.AddDays(windowDays.Value) : (DateTime?)null,
                items = order.Items.Select(i => new { i.Id, name = i.ProductName, i.Quantity, remaining = i.Quantity - lines.Where(l => l.OrderItemId == i.Id).Sum(l => l.Quantity) }) });
        }).RequireAuthorization(Policies.CustomerStaffOrAdmin);
        app.MapPost("/api/orders/{id:int}/returns", async (int id, ReturnRequest request, IAppDbContext db, ICurrentUser caller, IClock clock, IConfiguration config, CancellationToken ct) =>
        {
            if (request.Kind is not (ServiceCaseKind.Return or ServiceCaseKind.Exchange) || string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 2000
                || request.Items is null || request.Items.Count is < 1 or > 200 || request.Items.Any(l => l.Quantity < 1)
                || request.Items.Select(l => l.OrderItemId).Distinct().Count() != request.Items.Count)
                throw new BusinessValidationException("Choose distinct order items, positive quantities and a return reason.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Orders\" WHERE \"Id\" = {id} FOR UPDATE", ct);
            var order = await db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id && o.CustomerId == caller.CustomerId, ct) ?? throw new NotFoundException("Order was not found.");
            if (order.Status != OrderStatus.Delivered) throw new BusinessValidationException("Return requests are available after delivery.");
            var days = config.GetValue<int?>("Returns:WindowDays");
            if (days is > 0 && order.DeliveredAt.HasValue && order.DeliveredAt.Value.AddDays(days.Value) < clock.UtcNow) throw new BusinessValidationException("The configured return window has ended. Contact support for help.");
            var activeCaseIds = await db.ServiceCases.Where(c => c.OrderId == id && c.Status != ServiceCaseStatus.Rejected).Select(c => c.Id).ToArrayAsync(ct);
            var previous = await db.ReturnLines.Where(l => activeCaseIds.Contains(l.ServiceCaseId)).ToListAsync(ct);
            foreach (var selected in request.Items)
            {
                var item = order.Items.SingleOrDefault(i => i.Id == selected.OrderItemId) ?? throw new BusinessValidationException("The selected item does not belong to this order.");
                if (selected.Quantity > item.Quantity - previous.Where(l => l.OrderItemId == item.Id).Sum(l => l.Quantity)) throw new ResourceConflictException("Return quantity exceeds the remaining purchased quantity.");
            }
            var entry = new ServiceCase { OrderId = id, CustomerId = order.CustomerId, Kind = request.Kind, Message = request.Reason.Trim(), CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow };
            db.ServiceCases.Add(entry); await db.SaveChangesAsync(ct);
            db.ReturnLines.AddRange(request.Items.Select(l => new ReturnLine { ServiceCaseId = entry.Id, OrderItemId = l.OrderItemId, Quantity = l.Quantity }));
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.Ok(new { entry.Id });
        }).RequireAuthorization(Policies.CustomerOnly).RequireRateLimiting("checkout");
        app.MapPost("/api/service-cases/{id:int}/inspect", async (int id, InspectReturnRequest request, IAppDbContext db, ICurrentUser caller, IClock clock, CancellationToken ct) =>
        {
            if (request.Items is null || request.Items.Count is < 1 or > 200 || string.IsNullOrWhiteSpace(request.Response) || request.Response.Length > 2000
                || request.Items.Select(l => l.Id).Distinct().Count() != request.Items.Count)
                throw new BusinessValidationException("Enter an inspection response and each returned item once.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var orderId = await db.ServiceCases.Where(c => c.Id == id).Select(c => (int?)c.OrderId).FirstOrDefaultAsync(ct) ?? throw new NotFoundException("Request was not found.");
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Orders\" WHERE \"Id\" = {orderId} FOR UPDATE", ct);
            var entry = await db.ServiceCases.SingleAsync(c => c.Id == id, ct);
            if (entry.Status != ServiceCaseStatus.Approved) throw new ResourceConflictException("Approve the return before inspecting it. Each return can be received once.");
            var lines = await db.ReturnLines.Where(l => l.ServiceCaseId == id).ToListAsync(ct);
            if (lines.Count != request.Items.Count) throw new BusinessValidationException("Inspect all items in the return together.");
            foreach (var inspected in request.Items.OrderBy(l => l.Id))
            {
                var line = lines.SingleOrDefault(l => l.Id == inspected.Id) ?? throw new BusinessValidationException("Inspection line was not found.");
                if (inspected.ReceivedQuantity < 0 || inspected.ReceivedQuantity > line.Quantity || inspected.RestockQuantity < 0 || inspected.RestockQuantity > inspected.ReceivedQuantity)
                    throw new BusinessValidationException("Restock quantity cannot exceed received quantity, and received quantity cannot exceed requested quantity.");
                line.ReceivedQuantity = inspected.ReceivedQuantity; line.RestockedQuantity = inspected.RestockQuantity;
                if (line.RestockedQuantity == 0) continue;
                var item = await db.OrderItems.AsNoTracking().SingleAsync(i => i.Id == line.OrderItemId, ct);
                await db.Products.Where(p => p.Id == item.ProductId).ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + line.RestockedQuantity), ct);
                db.InventoryMovements.Add(new InventoryMovement { ProductId = item.ProductId, OrderId = orderId, Delta = line.RestockedQuantity,
                    Reason = $"Return #{entry.Id} inspected and restocked", CreatedByUserId = caller.UserId, CreatedAt = clock.UtcNow });
            }
            entry.Status = ServiceCaseStatus.Received; entry.Response = request.Response.Trim(); entry.UpdatedAt = clock.UtcNow;
            db.AuditLogs.Add(new AuditLog { Action = "return.inspected", EntityType = "ServiceCase", EntityId = id.ToString(), UserId = caller.UserId, CreatedAt = clock.UtcNow });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.NoContent();
        }).RequireAuthorization(Policies.StaffOrAdmin);
    }
}
