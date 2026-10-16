using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NineCube.Api.Auth;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;


namespace NineCube.Api.Controllers;

[Route("api/orders")]
[Produces("application/json")]
[Authorize]
public sealed class OrdersController : ApiControllerBase
{
    private readonly IOrderService _orders;
    private readonly IValidator<CreateOrderRequest> _createValidator;

    public OrdersController(IOrderService orders, IValidator<CreateOrderRequest> createValidator)
    {
        _orders = orders;
        _createValidator = createValidator;
    }

    /// <summary>
    /// Places an order and reserves stock in a single transaction.
    ///
    /// Send a stable <c>Idempotency-Key</c> header per checkout attempt: replaying the same key
    /// (for the same customer) returns the original order and never consumes stock twice.
    /// </summary>
    [HttpPost]
    [Authorize(Policy = Policies.CustomerOnly)]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<OrderDto>> Place([FromBody] CreateOrderRequest request, CancellationToken ct)
    {
        await ValidateAsync(_createValidator, request, ct);

        var result = await _orders.PlaceOrderAsync(request, IdempotencyKey, ct);

        // A replay of an existing key returns 200 with the original order instead of a new 201.
        return result.Replayed
            ? Ok(result.Order)
            : CreatedAtAction(nameof(GetById), new { id = result.Order.Id }, result.Order);
    }

    /// <summary>Customers see only their own orders; Staff and Administrator see all.</summary>
    [HttpGet]
    [Authorize(Policy = Policies.CustomerStaffOrAdmin)]
    [ProducesResponseType(typeof(PagedResult<OrderDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<OrderDto>>> List(
        [FromQuery] OrderStatus? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default) =>
        Ok(await _orders.ListOrdersAsync(status, page, pageSize, ct));

    [HttpGet("{id:int}")]
    [Authorize(Policy = Policies.CustomerStaffOrAdmin)]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<OrderDto>> GetById(int id, CancellationToken ct) =>
        Ok(await _orders.GetOrderAsync(id, ct));

    /// <summary>The owning customer while Pending/Confirmed, or Staff at any point before shipping.</summary>
    [HttpPost("{id:int}/cancel")]
    [Authorize(Policy = Policies.CustomerOrStaff)]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<OrderDto>> Cancel(int id, CancellationToken ct) =>
        Ok(await _orders.CancelAsync(id, ct));

    [HttpPost("{id:int}/confirm")]
    [Authorize(Policy = Policies.StaffOnly)]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<OrderDto>> Confirm(int id, CancellationToken ct) =>
        Ok(await _orders.ConfirmAsync(id, ct));

    /// <summary>Rejecting a Pending order also releases its stock reservation.</summary>
    [HttpPost("{id:int}/reject")]
    [Authorize(Policy = Policies.StaffOnly)]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<OrderDto>> Reject(int id, CancellationToken ct) =>
        Ok(await _orders.RejectAsync(id, ct));

    [HttpPost("{id:int}/ship")]
    [Authorize(Policy = Policies.StaffOnly)]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<OrderDto>> Ship(int id, CancellationToken ct) =>
        Ok(await _orders.ShipAsync(id, ct));

    /// <summary>Printable invoice, generated from the order itself - no extra tables.</summary>
    [HttpGet("{id:int}/invoice")]
    [Authorize(Policy = Policies.CustomerStaffOrAdmin)]
    [ProducesResponseType(typeof(InvoiceDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<InvoiceDto>> Invoice(int id, CancellationToken ct) =>
        Ok(await _orders.GetInvoiceAsync(id, ct));
}
