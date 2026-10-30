using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Endpoints;

public sealed class NotificationEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/notifications")
            .WithTags("Notifications")
            .RequireAuthorization(Policies.AnyAuthenticated);

        group.MapGet("/", ListNotificationsAsync)
            .WithName("ListNotifications")
            .WithSummary("The caller's own inbox.");

        group.MapGet("/unread-count", GetUnreadCountAsync)
            .WithName("GetUnreadNotificationCount")
            .WithSummary("Unread notification count badge.");

        group.MapPost("/read-all", MarkAllReadAsync)
            .WithName("MarkAllNotificationsRead")
            .WithSummary("Marks all inbox notifications as read.");

        group.MapPost("/{id:int}/read", MarkReadAsync)
            .WithName("MarkNotificationRead")
            .WithSummary("Marks a single notification as read.");

        group.MapDelete("/{id:int}", DeleteNotificationAsync)
            .WithName("DeleteNotification")
            .WithSummary("Deletes a notification.");
    }

    public static async Task<Results<Ok<PagedResult<NotificationDto>>, ProblemHttpResult>> ListNotificationsAsync(
        [FromQuery] bool unreadOnly = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        INotificationService notifications = null!,
        CancellationToken ct = default)
    {
        var result = await notifications.ListAsync(unreadOnly, page, pageSize, ct);
        return TypedResults.Ok(result);
    }

    public static async Task<Results<Ok<UnreadCountDto>, ProblemHttpResult>> GetUnreadCountAsync(
        INotificationService notifications,
        CancellationToken ct)
    {
        var count = await notifications.UnreadCountAsync(ct);
        return TypedResults.Ok(count);
    }

    public static async Task<Results<Ok<UnreadCountDto>, ProblemHttpResult>> MarkAllReadAsync(
        INotificationService notifications,
        CancellationToken ct)
    {
        var unreadRemaining = await notifications.MarkAllReadAsync(ct);
        return TypedResults.Ok(new UnreadCountDto(unreadRemaining));
    }

    public static async Task<Results<Ok<NotificationDto>, ProblemHttpResult>> MarkReadAsync(
        int id,
        INotificationService notifications,
        CancellationToken ct)
    {
        var notification = await notifications.MarkReadAsync(id, ct);
        return TypedResults.Ok(notification);
    }

    public static async Task<Results<NoContent, ProblemHttpResult>> DeleteNotificationAsync(
        int id,
        INotificationService notifications,
        CancellationToken ct)
    {
        await notifications.DeleteAsync(id, ct);
        return TypedResults.NoContent();
    }
}
