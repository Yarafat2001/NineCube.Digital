using Microsoft.EntityFrameworkCore;

namespace NineCube.Application.Abstractions;

/// <summary>
/// Provider specific error classification, implemented in Infrastructure so the application
/// layer never has to reference Microsoft.Data.SqlClient directly. Keeping the SQL error
/// numbers in one place is also what stops retry logic from creeping into controllers.
/// </summary>
public interface ITransientErrorPolicy
{
    /// <summary>Unique index / primary key violation (SQL 2601/2627).</summary>
    bool IsUniqueViolation(Exception exception);

    /// <summary>CHECK constraint violation (SQL 547) - the DB's last line of defence against negative stock.</summary>
    bool IsCheckConstraintViolation(Exception exception);

    /// <summary>Deadlock victim (SQL 1205) or snapshot conflict (SQL 3960). Safe to retry: the transaction rolled back.</summary>
    bool IsTransientConflict(Exception exception);

    /// <summary>
    /// Runs <paramref name="operation"/> and retries only on a transient conflict. Because the
    /// failed attempt's transaction has already rolled back, a retry can never double-apply a
    /// stock decrement.
    /// </summary>
    Task<T> ExecuteWithRetryAsync<T>(Func<Task<T>> operation, int maxAttempts = 3);
}

public static class DbExceptionExtensions
{
    public static IEnumerable<Exception> Flatten(this Exception? exception)
    {
        var seen = new HashSet<Exception>();
        var stack = new Stack<Exception?>();
        stack.Push(exception);
        while (stack.Count > 0)
        {
            var current = stack.Pop();
            if (current is null || !seen.Add(current)) continue;
            yield return current;
            if (current is DbUpdateException dbUpdate && dbUpdate.InnerException is not null)
                stack.Push(dbUpdate.InnerException);
            if (current.InnerException is not null) stack.Push(current.InnerException);
        }
    }
}
