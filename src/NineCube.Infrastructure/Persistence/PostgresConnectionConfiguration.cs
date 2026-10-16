using Microsoft.Extensions.Configuration;
using Npgsql;

namespace NineCube.Infrastructure.Persistence;

public static class PostgresConnectionConfiguration
{
    public static string Resolve(IConfiguration configuration)
    {
        var value = configuration.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(value)) value = configuration["DATABASE_URL"];
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException("Configure ConnectionStrings__Default or DATABASE_URL for PostgreSQL.");
        return Normalize(value);
    }

    public static string Normalize(string value)
    {
        try
        {
            value = value.Trim();
            if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
                && !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
                return new NpgsqlConnectionStringBuilder(value).ConnectionString;

            var uri = new Uri(value, UriKind.Absolute);
            var credentials = uri.UserInfo.Split(':', 2);
            if (credentials.Length != 2 || string.IsNullOrWhiteSpace(uri.Host) || uri.AbsolutePath.Length <= 1)
                throw new FormatException();
            var builder = new NpgsqlConnectionStringBuilder
            {
                Host = uri.Host,
                Port = uri.Port > 0 ? uri.Port : 5432,
                Username = Uri.UnescapeDataString(credentials[0]),
                Password = Uri.UnescapeDataString(credentials[1]),
                Database = Uri.UnescapeDataString(uri.AbsolutePath[1..])
            };
            foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = pair.Split('=', 2);
                if (parts.Length != 2) throw new FormatException();
                var key = Uri.UnescapeDataString(parts[0]);
                var parameter = Uri.UnescapeDataString(parts[1]);
                builder[key.Equals("sslmode", StringComparison.OrdinalIgnoreCase) ? "SSL Mode" : key] = parameter;
            }
            return builder.ConnectionString;
        }
        catch (Exception ex) when (ex is ArgumentException or FormatException or KeyNotFoundException)
        {
            // Never include the original URI or parser exception: both can contain credentials.
            throw new InvalidOperationException("Invalid PostgreSQL configuration. Use a postgres[ql]:// URL or an Npgsql Host=...;Database=...;Username=...;Password=... connection string.");
        }
    }
}
