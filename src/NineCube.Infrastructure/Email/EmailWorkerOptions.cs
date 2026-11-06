namespace NineCube.Infrastructure.Email;

/// <summary>
/// Retry policy for the email outbox, bound from the Email:Worker configuration section.
/// The lease on each delivery doubles as the retry delay: a failed attempt parks the row
/// until its lease expires, so the queue naturally backs off instead of hammering SMTP.
/// </summary>
public sealed class EmailWorkerOptions
{
    public const int DefaultMaxAttempts = 5;
    public static readonly int[] DefaultBackoffMinutes = [1, 5, 15, 60];

    private int _maxAttempts = DefaultMaxAttempts;
    private int[] _backoffMinutes = DefaultBackoffMinutes;

    /// <summary>Total send attempts before a delivery is dead-lettered.</summary>
    public int MaxAttempts
    {
        get => _maxAttempts;
        set => _maxAttempts = value > 0 ? value : DefaultMaxAttempts;
    }

    /// <summary>Wait before retrying after the 1st, 2nd, 3rd, ... failure; the last entry repeats.</summary>
    public int[] BackoffMinutes
    {
        get => _backoffMinutes;
        set => _backoffMinutes = value is { Length: > 0 } ? value : DefaultBackoffMinutes;
    }

    public int BackoffForAttempt(int attempts)
    {
        var index = Math.Min(Math.Max(attempts - 1, 0), _backoffMinutes.Length - 1);
        return Math.Max(_backoffMinutes[index], 0);
    }
}
