using NineCube.Application.Abstractions;

namespace NineCube.Tests.Infrastructure;

/// <summary>
/// Test stand-in for SMTP. Succeeds by default; FailWith makes every subsequent send throw,
/// which lets a test drive the worker through its retry and dead-letter paths.
/// </summary>
public sealed class FakeEmailSender : IEmailSender
{
    private readonly Lock _gate = new();
    private Exception? _failure;

    public List<(string Recipient, string Subject, string Body)> Sent { get; } = [];
    public int SendCalls { get; private set; }

    public void Succeed()
    {
        lock (_gate) _failure = null;
    }

    public void FailWith(Exception failure)
    {
        lock (_gate) _failure = failure;
    }

    public Task SendEmailAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        Exception? failure;
        lock (_gate)
        {
            SendCalls++;
            failure = _failure;
            if (failure is null) Sent.Add((toEmail, subject, htmlBody));
        }

        if (failure is not null) throw failure;
        return Task.CompletedTask;
    }
}
