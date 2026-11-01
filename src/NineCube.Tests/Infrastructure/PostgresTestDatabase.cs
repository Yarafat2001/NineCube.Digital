using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Npgsql;

namespace NineCube.Tests.Infrastructure;

/// <summary>
/// A throwaway PostgreSQL database for the service tests, because the application only speaks Npgsql
/// now: an InMemory or SQL Server stand-in would prove nothing about the scope rules, the CHECK
/// constraints or the SingleQuery splitting behaviour the catalogue depends on.
///
///   1. Docker mode (default): Testcontainers starts `postgres:18-alpine` on a random host port.
///   2. Local mode: TEST_POSTGRES_CONNECTION points the run at an instance you already own.
///
/// The container is created and destroyed per test class, and the password below only ever opens a
/// database that lives for the length of the run.
/// </summary>
public sealed class PostgresTestDatabase : IAsyncDisposable
{
    private const int ContainerPort = 5432;
    private const string Database = "ninecube_tests";
    private const string Username = "ninecube";

    /// <summary>Throwaway container credential: it exists only while this test run is alive.</summary>
    private const string Password = "ninecube-integration-only";

    public string ConnectionString { get; private set; } = string.Empty;
    public string Mode { get; private set; } = string.Empty;

    private IContainer? _container;

    public async Task InitializeAsync()
    {
        var explicitConnection = Environment.GetEnvironmentVariable("TEST_POSTGRES_CONNECTION");
        if (!string.IsNullOrWhiteSpace(explicitConnection))
        {
            Mode = "local PostgreSQL via TEST_POSTGRES_CONNECTION";
            ConnectionString = explicitConnection;
            Console.WriteLine($"[PostgresTestDatabase] mode: {Mode}");
            return;
        }

        try
        {
            _container = new ContainerBuilder()
                .WithImage("postgres:18-alpine")
                .WithCleanUp(true)
                .WithName($"ninecube-tests-{Guid.NewGuid():N}"[..40])
                .WithEnvironment("POSTGRES_USER", Username)
                .WithEnvironment("POSTGRES_PASSWORD", Password)
                .WithEnvironment("POSTGRES_DB", Database)
                .WithPortBinding(ContainerPort, true)
                .WithWaitStrategy(Wait.ForUnixContainer()
                    .UntilMessageIsLogged("database system is ready to accept connections"))
                .Build();

            await _container.StartAsync();
            Mode = "Docker / Testcontainers (postgres:18-alpine)";
            ConnectionString = new NpgsqlConnectionStringBuilder
            {
                Host = "127.0.0.1",
                Port = _container.GetMappedPublicPort(ContainerPort),
                Database = Database,
                Username = Username,
                Password = Password,
                Timeout = 30,
                CommandTimeout = 120
            }.ConnectionString;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "No PostgreSQL test database available. Either start Docker (Testcontainers mode) or point " +
                "TEST_POSTGRES_CONNECTION at a real instance:\n" +
                "  TEST_POSTGRES_CONNECTION=\"Host=127.0.0.1;Port=5432;Database=ninecube_tests;Username=postgres;Password=<pw>\" \\\n" +
                "    dotnet test src/NineCube.Tests/NineCube.Tests.csproj --filter CouponScopeTests",
                ex);
        }

        // The image logs "ready to accept connections" once for its temporary init server, so the
        // first real connect can still be refused. Retry until the postmaster answers.
        await WaitForConnectionsAsync();
        Console.WriteLine($"[PostgresTestDatabase] mode: {Mode}, port: {new NpgsqlConnectionStringBuilder(ConnectionString).Port}");
    }

    private async Task WaitForConnectionsAsync()
    {
        var lastError = string.Empty;
        for (var attempt = 0; attempt < 30; attempt++)
        {
            try
            {
                await using var connection = new NpgsqlConnection(ConnectionString);
                await connection.OpenAsync();
                await using var command = connection.CreateCommand();
                command.CommandText = "SELECT 1";
                _ = await command.ExecuteScalarAsync();
                return;
            }
            catch (Exception ex)
            {
                lastError = ex.Message;
                await Task.Delay(TimeSpan.FromSeconds(1));
            }
        }

        throw new InvalidOperationException($"PostgreSQL test container never accepted connections: {lastError}");
    }

    public async ValueTask DisposeAsync()
    {
        if (_container is not null)
        {
            await _container.StopAsync();
            await _container.DisposeAsync();
        }
    }
}
