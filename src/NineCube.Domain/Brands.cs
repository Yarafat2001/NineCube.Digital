namespace NineCube.Domain;

/// <summary>
/// A manufacturer brand. Populated from real catalogue data only (the "Brand: &lt;Name&gt;" tags and
/// product names); nothing is invented, so a brand exists exactly when at least one product carries it.
/// </summary>
public sealed class Brand
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public List<ProductLine> Lines { get; set; } = new();
}

/// <summary>
/// A product line / series within a brand (for example iPhone 13 under Apple, NEXG under Walton).
/// Only lines observed in real product names exist here.
/// </summary>
public sealed class ProductLine
{
    public int Id { get; set; }
    public int BrandId { get; set; }
    public Brand? Brand { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// An image stored for a product. Exactly one image per product carries IsPrimary = true, which a
/// filtered unique index enforces in the database. Product.ImageUrl mirrors the primary image so the
/// catalogue and the seeded path-based images keep working.
/// </summary>
public sealed class ProductImage
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string Url { get; set; } = string.Empty;
    /// <summary>Server-side relative path of the stored file, used to delete it when it is no longer referenced.</summary>
    public string? StoragePath { get; set; }
    public bool IsPrimary { get; set; }
    public int SortOrder { get; set; }
    public string? AltText { get; set; }
    public DateTime CreatedAt { get; set; }
}
