namespace NineCube.Domain;

public enum ServiceCaseKind { Support, Return, Exchange, Warranty }
public enum ServiceCaseStatus { Open, Approved, Rejected, Completed, Received }

public sealed class ServiceCase
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public int CustomerId { get; set; }
    public ServiceCaseKind Kind { get; set; }
    public ServiceCaseStatus Status { get; set; }
    public string Message { get; set; } = "";
    public string? Response { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
