using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NineCube.Application.Abstractions;

namespace NineCube.Infrastructure.Email;

public sealed class SmtpEmailSender : IEmailSender
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IConfiguration configuration, ILogger<SmtpEmailSender> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task SendEmailAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        var host = _configuration["Email:Smtp:Host"];
        var portStr = _configuration["Email:Smtp:Port"];
        var username = _configuration["Email:Smtp:Username"];
        var password = _configuration["Email:Smtp:Password"];
        var fromEmail = _configuration["Email:Smtp:From"] ?? "noreply@ninecube.digital";

        // When SMTP is not configured (e.g. development or preview), log and succeed cleanly without dropping requests
        if (string.IsNullOrWhiteSpace(host))
        {
            _logger.LogInformation("Email simulation (no SMTP host configured) to {To}: {Subject}", toEmail, subject);
            return;
        }

        var port = int.TryParse(portStr, out var p) ? p : 587;
        var enableSsl = bool.TryParse(_configuration["Email:Smtp:EnableSsl"], out var ssl) ? ssl : true;

        try
        {
            using var client = new SmtpClient(host, port)
            {
                EnableSsl = enableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false
            };

            if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password))
            {
                client.Credentials = new NetworkCredential(username, password);
            }

            using var message = new MailMessage(fromEmail, toEmail)
            {
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true
            };

            await client.SendMailAsync(message, ct);
            _logger.LogInformation("Email successfully sent to {To}: {Subject}", toEmail, subject);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {To}: {Subject}", toEmail, subject);
        }
    }
}
