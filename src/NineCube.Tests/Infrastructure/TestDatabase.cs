using Microsoft.Data.SqlClient;
using Testcontainers.MsSql;

namespace NineCube.Tests.Infrastructure;

/// <summary>
/// A REAL SQL Server database for the integration tests, in one of two documented modes:
///
///   1. Docker mode (default): Testcontainers starts a throwaway SQL Server 2022 container.
///   2. Local mode: when the TEST_SQL_CONNECTION environment variable is set, that instance is
///      used instead (local SQL Server / Express / LocalDB).
///
/// Either way a *fresh, uniquely named* database is created for the run and dropped afterwards,
/// so a non-test database is never touched. There is deliberately no InMemory or SQLite fallback:
/// the race and stress tests would prove nothing without real row locking and a real CHECK constraint.
/// </summary>
public sealed class TestDatabase
{
    public string ConnectionString { get; private set; } = string.Empty;
    public string Mode { get; private set; } = string.Empty;

    private string _databaseName = string.Empty;
    private string _adminConnectionString = string.Empty;
    private MsSqlContainer? _container;

    public async Task InitializeAsync()
    {
        var explicitConnection = Environment.GetEnvironmentVariable("TEST_SQL_CONNECTION");

        if (!string.IsNullOrWhiteSpace(explicitConnection))
        {
            Mode = "local SQL Server via TEST_SQL_CONNECTION";
            _adminConnectionString = explicitConnection;
        }
        else
        {
            try
            {
                _container = new MsSqlBuilder()
                    .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
                    .Build();

                await _container.StartAsync();
                Mode = "Docker / Testcontainers (mcr.microsoft.com/mssql/server:2022-latest)";
                _adminConnectionString = _container.GetConnectionString();
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    "No test database available. Either start Docker (Testcontainers mode) or point " +
                    "TEST_SQL_CONNECTION at a real SQL Server instance. Examples:\n" +
                    "  # Docker mode\n" +
                    "  docker info\n" +
                    "  dotnet test src/NineCube.Tests/NineCube.Tests.csproj\n" +
                    "  # Local mode (SQL Server after `docker compose up -d`)\n" +
                    "  TEST_SQL_CONNECTION=\"Server=localhost,14330;User Id=sa;Password=<pw>;TrustServerCertificate=True;Encrypt=False\" \\\n" +
                    "    dotnet test src/NineCube.Tests/NineCube.Tests.csproj\n" +
                    "  # Local mode (LocalDB)\n" +
                    "  TEST_SQL_CONNECTION=\"Server=(localdb)\\\\MSSQLLocalDB;Integrated Security=true;TrustServerCertificate=True\" \\\n" +
                    "    dotnet test src/NineCube.Tests/NineCube.Tests.csproj",
                    ex);
            }
        }

        _databaseName = $"NineCubeTests_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid().ToString("N")[..8]}";

        await CreateDatabaseAsync();

        ConnectionString = new SqlConnectionStringBuilder(_adminConnectionString)
        {
            InitialCatalog = _databaseName,
            ConnectTimeout = 60
        }.ConnectionString;

        Console.WriteLine($"[TestDatabase] mode: {Mode}");
        Console.WriteLine($"[TestDatabase] database: {_databaseName}");
    }

    private async Task CreateDatabaseAsync()
    {
        var master = new SqlConnectionStringBuilder(_adminConnectionString)
        {
            InitialCatalog = "master",
            ConnectTimeout = 60
        }.ConnectionString;

        await using var connection = new SqlConnection(master);
        await connection.OpenAsync();

        // Retry: a freshly started container accepts connections slightly before it serves DDL reliably.
        var attempt = 0;
        while (true)
        {
            attempt++;
            try
            {
                await using var command = connection.CreateCommand();
                command.CommandText = $"CREATE DATABASE [{_databaseName}]";
                command.CommandTimeout = 120;
                await command.ExecuteNonQueryAsync();
                return;
            }
            catch (SqlException) when (attempt < 5)
            {
                await Task.Delay(TimeSpan.FromSeconds(2));
            }
        }
    }

    public async Task DisposeAsync()
    {
        try
        {
            var master = new SqlConnectionStringBuilder(_adminConnectionString)
            {
                InitialCatalog = "master",
                ConnectTimeout = 60
            }.ConnectionString;

            await using var connection = new SqlConnection(master);
            await connection.OpenAsync();

            await using var command = connection.CreateCommand();
            command.CommandText =
                $"IF DB_ID('{_databaseName}') IS NOT NULL BEGIN " +
                $"ALTER DATABASE [{_databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; " +
                $"DROP DATABASE [{_databaseName}]; END";
            command.CommandTimeout = 120;
            await command.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TestDatabase] warning: could not drop {_databaseName}: {ex.Message}");
        }

        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }
}
