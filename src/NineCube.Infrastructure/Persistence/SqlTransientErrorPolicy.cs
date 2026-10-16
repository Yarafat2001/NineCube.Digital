using Microsoft.Data.SqlClient;
using NineCube.Application.Abstractions;

namespace NineCube.Infrastructure.Persistence;

/// <summary>
/// Translates SQL Server error numbers into the three categories the application cares about.
/// Keeping this in Infrastructure is what lets the order service express "retry a deadlock"
/// without knowing anything about SQL Server.
/// </summary>
public sealed class SqlTransientErrorPolicy : ITransientErrorPolicy
{
    private const int UniqueIndexViolation = 2601;
    private const int UniqueConstraintViolation = 2627;
    private const int CheckConstraintViolation = 547;
    private const int DeadlockVictim = 1205;
    private const int SnapshotIsolationConflict = 3960;

    public bool IsUniqueViolation(Exception exception) =>
        HasSqlError(exception, UniqueIndexViolation, UniqueConstraintViolation);

    public bool IsCheckConstraintViolation(Exception exception) =>
        HasSqlError(exception, CheckConstraintViolation);

    public bool IsTransientConflict(Exception exception) =>
        HasSqlError(exception, DeadlockVictim, SnapshotIsolationConflict);

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

    private static bool HasSqlError(Exception exception, params int[] numbers) =>
        exception.Flatten().OfType<SqlException>().Any(sql => numbers.Contains(sql.Number));
}
