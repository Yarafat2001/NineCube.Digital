namespace NineCube.Domain;

public sealed class SavedCart
{
    public int CustomerId { get; set; }
    public string ItemsJson { get; set; } = "[]";
    public int Version { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class AccountChallenge
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int Attempts { get; set; }
    public string Purpose { get; set; } = "verify-email";
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
}

public sealed class GuestRecovery
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
}

public sealed class ReviewReport
{
    public int Id { get; set; }
    public int ReviewId { get; set; }
    public int CustomerId { get; set; }
    public string Reason { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public sealed class Supplier
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class PurchaseOrder
{
    public int Id { get; set; }
    public int SupplierId { get; set; }
    public string Reference { get; set; } = "";
    public string Currency { get; set; } = "BDT";
    public string Status { get; set; } = "Open";
    public DateTime CreatedAt { get; set; }
    public List<PurchaseOrderLine> Lines { get; set; } = [];
}

public sealed class PurchaseOrderLine
{
    public int Id { get; set; }
    public int PurchaseOrderId { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public int ReceivedQuantity { get; set; }
    public decimal UnitCost { get; set; }
}

public sealed class ReturnLine
{
    public int Id { get; set; }
    public int ServiceCaseId { get; set; }
    public int OrderItemId { get; set; }
    public int Quantity { get; set; }
    public int ReceivedQuantity { get; set; }
    public int RestockedQuantity { get; set; }
}

public sealed class RefundRecord
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int? ServiceCaseId { get; set; }
    public decimal Amount { get; set; }
    public decimal GiftCardAmount { get; set; }
    public string Currency { get; set; } = "BDT";
    public string Status { get; set; } = "Pending";
    public string Reason { get; set; } = "";
    public string? Reference { get; set; }
    public string? Method { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? SettledAt { get; set; }
}
