using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using NineCube.Domain;

namespace NineCube.Api.Controllers;

[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    /// <summary>
    /// FluentValidation at the edge. The same rules are re-checked inside the services, because
    /// the API is not the only caller - the tests and any future worker call the services directly.
    ///
    /// The keys are lower-camelised so they match the property names the client actually sent and
    /// the rest of the JSON contract; the services already report their errors that way.
    /// </summary>
    protected async Task ValidateAsync<T>(IValidator<T> validator, T request, CancellationToken ct)
    {
        var result = await validator.ValidateAsync(request, ct);

        if (!result.IsValid)
        {
            throw new BusinessValidationException("The request is invalid.", ToCamelCase(result.ToDictionary()));
        }
    }

    private static IDictionary<string, string[]> ToCamelCase(IDictionary<string, string[]> errors) =>
        errors.ToDictionary(
            pair => string.IsNullOrEmpty(pair.Key) || char.IsLower(pair.Key[0])
                ? pair.Key
                : char.ToLowerInvariant(pair.Key[0]) + pair.Key[1..],
            pair => pair.Value);

    protected string? IdempotencyKey =>
        Request.Headers.TryGetValue("Idempotency-Key", out var value) && !string.IsNullOrWhiteSpace(value.ToString())
            ? value.ToString()
            : null;
}
