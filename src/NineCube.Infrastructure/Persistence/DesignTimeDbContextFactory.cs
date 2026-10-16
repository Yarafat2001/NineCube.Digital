using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace NineCube.Infrastructure.Persistence;

/// <summary>
/// Used only by <c>dotnet ef</c>. Scaffolding a migration does not need a reachable database, so
/// this deliberately does not read the API's configuration: the tool then works in CI (and on a
/// machine with no SQL Server running) without any secrets being present.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Default")
            ?? Environment.GetEnvironmentVariable("NINECUBE_DESIGN_TIME_CONNECTION")
            ?? "Host=localhost;Database=NineCubeOrderProcessing;Username=postgres;Password=DesignTimePlaceholder!1;";

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(PostgresConnectionConfiguration.Normalize(connectionString))
            .Options;

        return new AppDbContext(options);
    }
}
