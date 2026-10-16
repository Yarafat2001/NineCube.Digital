using NineCube.Application.Abstractions;

namespace NineCube.Infrastructure.Persistence;

/// <summary>
/// Translates PostgreSQL error codes into the three categories the application cares about.
/// Keeping this in Infrastructure is what lets the order service express "retry a deadlock"
/// without knowing anything about PostgreSQL.
/// </summary>
public sealed class PostgresTransientErrorPolicy : ITransientErrorPolicy
{
    // PostgreSQL SQLSTATE codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
    private const string UniqueViolation = "23505";      // unique_violation
    private const string CheckViolation = "23514";       // check_violation
    private const string DeadlockDetected = "40P01";     // deadlock_detected
    private const string SerializationFailure = "40001"; // serialization_failure

    public bool IsUniqueViolation(Exception exception) =>
        HasPostgresError(exception, UniqueViolation);

    public bool IsCheckConstraintViolation(Exception exception) =>
        HasPostgresError(exception, CheckViolation);

    public bool IsTransientConflict(Exception exception) =>
        HasPostgresError(exception, DeadlockDetected, SerializationFailure);

    public async Task<T> ExecuteWithRetryAsync<T>(Func<Task<T>> operation, int maxAttempts = 3)
    {
        var attempt = 0;

        while (true)
        {
            attempt++;
            try
            {
                return await operation();
            }
            catch (Exception ex) when (attempt < maxAttempts && IsTransientConflict(ex))
            {
                // The failed attempt's transaction has already rolled back, so retrying cannot
                // double-apply a stock change. Back off a little to let the other transaction finish.
                await Task.Delay(TimeSpan.FromMilliseconds(25 * attempt * Random.Shared.Next(1, 4)));
            }
        }
    }

    private static bool HasPostgresError(Exception exception, params string[] sqlStates) =>
        exception.Flatten().OfType<Npgsql.PostgresException>().Any(pg => sqlStates.Contains(pg.SqlState));
}
