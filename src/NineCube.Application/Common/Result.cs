namespace NineCube.Application.Common;

/// <summary>
/// Explicit, structured error contract for operations that do not throw exceptions for control flow.
/// </summary>
public readonly record struct Error(string Code, string Message, int StatusCode = 400, IDictionary<string, string[]>? Details = null)
{
    public static readonly Error None = new(string.Empty, string.Empty, 200);

    public static Error NotFound(string code, string message) =>
        new(code, message, 404);

    public static Error Conflict(string code, string message) =>
        new(code, message, 409);

    public static Error Validation(string message, IDictionary<string, string[]>? errors = null) =>
        new("invalid_request", message, 400, errors);

    public static Error Unauthorized(string message = "Authentication required.") =>
        new("unauthorized", message, 401);

    public static Error Forbidden(string message = "You do not have permission to perform this action.") =>
        new("forbidden", message, 403);

    public static Error Failure(string code, string message, int statusCode = 400) =>
        new(code, message, statusCode);
}

/// <summary>
/// Result type representing either a successful value or an explicit <see cref="Error"/>.
/// </summary>
public readonly record struct Result<T>
{
    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public T? Value { get; }
    public Error Error { get; }

    private Result(T value)
    {
        IsSuccess = true;
        Value = value;
        Error = Error.None;
    }

    private Result(Error error)
    {
        IsSuccess = false;
        Value = default;
        Error = error;
    }

    public static Result<T> Success(T value) => new(value);
    public static Result<T> Failure(Error error) => new(error);

    public static implicit operator Result<T>(T value) => Success(value);
    public static implicit operator Result<T>(Error error) => Failure(error);
}

/// <summary>
/// Non-generic Result type representing success or an explicit <see cref="Error"/>.
/// </summary>
public readonly record struct Result
{
    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public Error Error { get; }

    private Result(bool isSuccess, Error error)
    {
        IsSuccess = isSuccess;
        Error = error;
    }

    public static Result Success() => new(true, Error.None);
    public static Result Failure(Error error) => new(false, error);

    public static implicit operator Result(Error error) => Failure(error);
}
