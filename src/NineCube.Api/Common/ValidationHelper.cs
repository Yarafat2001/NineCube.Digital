using FluentValidation;
using NineCube.Domain;

namespace NineCube.Api.Common;

public static class ValidationHelper
{
    /// <summary>
    /// Validates an incoming request model with FluentValidation.
    /// Throws <see cref="BusinessValidationException"/> on failure to produce standard RFC 7807 ProblemDetails.
    /// </summary>
    public static async Task ValidateAsync<T>(IValidator<T> validator, T request, CancellationToken ct)
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
}
