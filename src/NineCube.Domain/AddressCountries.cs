using System.Text.Json;
using System.Text.Json.Serialization;

namespace NineCube.Domain;

/// <summary>Bundled libaddressinput metadata; customer addresses never leave this application.</summary>
public sealed record AddressCountry
{
    [JsonPropertyName("require")] public string Required { get; init; } = "AC";
    [JsonPropertyName("fmt")] public string Format { get; init; } = "%N%n%O%n%A%n%C";
    public bool Requires(char field) => Required.Contains(field);
}

public static class AddressCountries
{
    private static readonly IReadOnlyDictionary<string, AddressCountry> Countries = Read();
    public static AddressCountry? Find(string? code) =>
        Countries.GetValueOrDefault((code ?? "BD").Trim().ToUpperInvariant());

    private static IReadOnlyDictionary<string, AddressCountry> Read()
    {
        using var stream = typeof(AddressCountries).Assembly.GetManifestResourceStream("NineCube.Domain.AddressCountries.json")!;
        return JsonSerializer.Deserialize<Dictionary<string, AddressCountry>>(stream)!;
    }
}
