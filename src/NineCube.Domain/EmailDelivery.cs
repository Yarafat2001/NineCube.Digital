namespace NineCube.Domain;

public sealed class EmailDelivery
{
    public int Id { get; set; }
    public string Key { get; set; } = "";
    public string Recipient { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime? SentAt { get; set; }
    public DateTime? LeaseUntil { get; set; }
    public int Attempts { get; set; }
}

public sealed class GiftCardPurchase
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public string RecipientEmail { get; set; } = "";
    public string RecipientName { get; set; } = "";
    public string? Note { get; set; }
    public int? GiftCardId { get; set; }
}
