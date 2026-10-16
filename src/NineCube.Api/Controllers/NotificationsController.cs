using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Api.Controllers;

/// <summary>
/// The caller's own inbox. No route takes a user id: the owner always comes from the token, so a
/// request for another user's notification finds nothing and answers 404.
/// </summary>
[Route("api/notifications")]
[Produces("application/json")]
[Authorize(Policy = Policies.AnyAuthenticated)]
public sealed class NotificationsController : ApiControllerBase
{
    private readonly INotificationService _notifications;

    public NotificationsController(INotificationService notifications) => _notifications = notifications;

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<NotificationDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<NotificationDto>>> List(
        [FromQuery] bool unreadOnly = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default) =>
        Ok(await _notifications.ListAsync(unreadOnly, page, pageSize, ct));

    /// <summary>Just the badge number, polled by the header instead of the whole list.</summary>
    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(UnreadCountDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<UnreadCountDto>> UnreadCount(CancellationToken ct) =>
        Ok(await _notifications.UnreadCountAsync(ct));

    [HttpPost("read-all")]
    [ProducesResponseType(typeof(UnreadCountDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<UnreadCountDto>> ReadAll(CancellationToken ct) =>
        Ok(new UnreadCountDto(await _notifications.MarkAllReadAsync(ct)));

    [HttpPost("{id:int}/read")]
    [ProducesResponseType(typeof(NotificationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<NotificationDto>> Read(int id, CancellationToken ct) =>
        Ok(await _notifications.MarkReadAsync(id, ct));

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await _notifications.DeleteAsync(id, ct);
        return NoContent();
    }
}
