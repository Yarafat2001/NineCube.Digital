namespace NineCube.Domain;

public sealed class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public int? ParentId { get; set; }
    public Category? Parent { get; set; }
    public string Path { get; set; } = "";
    public int Depth { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}
public sealed class ProductCategory
{
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;
    public bool IsPrimary { get; set; }
}
public sealed class Tag
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}
public sealed class ProductTag
{
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int TagId { get; set; }
    public Tag Tag { get; set; } = null!;
}
