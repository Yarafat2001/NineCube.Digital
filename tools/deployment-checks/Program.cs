using Microsoft.Extensions.Configuration;
using NineCube.Infrastructure.Persistence;
using Npgsql;

void Check(bool result, string name)
{
    if (!result) throw new Exception($"FAILED: {name}");
    Console.WriteLine($"PASS: {name}");
}
var parsed = new NpgsqlConnectionStringBuilder(PostgresConnectionConfiguration.Normalize(
    "postgresql://demo:p%40ss%3Bword@db.internal:5433/shop%20db?sslmode=require"));
Check(parsed.Host == "db.internal" && parsed.Port == 5433, "URL host and custom port");
Check(parsed.Username == "demo" && parsed.Password == "p@ss;word" && parsed.Database == "shop db", "Escaped credentials and database");
Check(parsed.SslMode == SslMode.Require, "URL TLS parameter");
parsed = new(PostgresConnectionConfiguration.Normalize("postgres://user:secret@db/shop"));
Check(parsed.Port == 5432, "Default PostgreSQL port and postgres alias");
var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
{
    ["ConnectionStrings:Default"] = " ",
    ["DATABASE_URL"] = "postgres://user:secret@fallback/shop"
}).Build();
Check(new NpgsqlConnectionStringBuilder(PostgresConnectionConfiguration.Resolve(config)).Host == "fallback", "Blank setting falls back to DATABASE_URL");
config["ConnectionStrings:Default"] = "Host=preferred;Database=shop;Username=user;Password=secret";
Check(new NpgsqlConnectionStringBuilder(PostgresConnectionConfiguration.Resolve(config)).Host == "preferred", "Explicit Npgsql setting takes precedence");
try
{
    PostgresConnectionConfiguration.Normalize("postgres://user:DO_NOT_LEAK@db/");
    throw new Exception("Expected rejection");
}
catch (InvalidOperationException ex)
{
    Check(!ex.ToString().Contains("DO_NOT_LEAK") && ex.InnerException is null, "Malformed URI rejected without leaking credentials");
}

if (Environment.GetEnvironmentVariable("CATALOGUE_CHECK_CONNECTION") is { Length: > 0 } connection)
    await CatalogueStockChecks.RunAsync(connection, Check);
