namespace NineCube.Domain;

/// <summary>
/// Base type for every *expected* business failure. The global exception middleware turns
/// these into RFC 7807 ProblemDetails responses. Anything that is not one of these is a
/// genuine bug and becomes a 500.
/// </summary>
public abstract class DomainException : Exception
{
    protected DomainException(string message) : base(message) { }
    public abstract int StatusCode { get; }
    public abstract string Code { get; }
}

/// <summary>400 - the request itself is malformed, e.g. an unknown product id.</summary>
public sealed class BusinessValidationException : DomainException
{
    public BusinessValidationException(string message, IDictionary<string, string[]>? errors = null)
        : base(message)
    {
        Errors = errors ?? new Dictionary<string, string[]>();
    }

    public override int StatusCode => 400;
    public override string Code => "invalid_request";
    public IDictionary<string, string[]> Errors { get; }
}

/// <summary>404 - also used when a customer asks for somebody else's order, so existence never leaks.</summary>
public sealed class NotFoundException : DomainException
{
    public NotFoundException(string message) : base(message) { }
    public override int StatusCode => 404;
    public override string Code => "not_found";
}

/// <summary>401 - missing/expired credentials, bad password, or a deactivated account.</summary>
public sealed class UnauthorizedException : DomainException
{
    public UnauthorizedException(string message) : base(message) { }
    public override int StatusCode => 401;
    public override string Code => "unauthorized";
}

/// <summary>403 - authenticated but the role is not allowed to do this.</summary>
public sealed class ForbiddenException : DomainException
{
    public ForbiddenException(string message) : base(message) { }
    public override int StatusCode => 403;
    public override string Code => "forbidden";
}

/// <summary>409 base class for "the world changed under you" conflicts.</summary>
public abstract class ConflictException : DomainException
{
    protected ConflictException(string message) : base(message) { }
    public override int StatusCode => 409;
}

/// <summary>409 - generic resource conflict (duplicate SKU, duplicate email, ...).</summary>
public sealed class ResourceConflictException : ConflictException
{
    public ResourceConflictException(string message, string code = "conflict") : base(message)
    {
        Code = code;
    }

    public override string Code { get; }
}

public sealed class ShortItem
{
    public int ProductId { get; init; }
    public string Sku { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public int Requested { get; init; }
    public int Available { get; init; }
}

/// <summary>409 - one or more lines have less stock than requested. Carries the exact shortfall.</summary>
public sealed class InsufficientStockException : ConflictException
{
    public InsufficientStockException(IReadOnlyList<ShortItem> shortItems)
        : base("One or more items do not have enough stock available.")
    {
        ShortItems = shortItems;
    }

    public override string Code => "insufficient_stock";
    public IReadOnlyList<ShortItem> ShortItems { get; }
}

/// <summary>409 - the order is not in a status that allows the requested transition.</summary>
public sealed class InvalidStateTransitionException : ConflictException
{
    public InvalidStateTransitionException(OrderStatus from, OrderStatus to)
        : base($"Order cannot move from {from} to {to}.")
    {
        From = from;
        To = to;
    }

    public override string Code => "invalid_state_transition";
    public OrderStatus From { get; }
    public OrderStatus To { get; }
}

/// <summary>409 - a stock adjustment would push the quantity below zero.</summary>
public sealed class StockAdjustmentConflictException : ConflictException
{
    public StockAdjustmentConflictException(string message) : base(message) { }
    public override string Code => "stock_adjustment_conflict";
}
