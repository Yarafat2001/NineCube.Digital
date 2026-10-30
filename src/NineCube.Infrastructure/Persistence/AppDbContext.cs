using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Infrastructure.Persistence;

public sealed class AppDbContext : DbContext, IAppDbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Product> Products => Set<Product>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<ProductTag> ProductTags => Set<ProductTag>();
    public DbSet<Brand> Brands => Set<Brand>();
    public DbSet<ProductLine> ProductLines => Set<ProductLine>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // Even direct product inserts (imports and test fixtures) get a primary category.
        foreach (var entry in ChangeTracker.Entries<Product>().Where(e => e.State == EntityState.Added).ToList())
        {
            if (string.IsNullOrWhiteSpace(entry.Entity.Slug))
                entry.Entity.Slug = "product-" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(entry.Entity.Sku))).ToLowerInvariant();
            if (entry.Entity.Categories.Count == 0)
                entry.Entity.Categories.Add(new ProductCategory { CategoryId = 1, IsPrimary = true });
            if (entry.Entity.Categories.Count(c => c.IsPrimary) != 1)
                throw new BusinessValidationException("A new product must have exactly one primary category.");
        }
        return base.SaveChangesAsync(cancellationToken);
    }
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<InventoryMovement> InventoryMovements => Set<InventoryMovement>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<Address> Addresses => Set<Address>();
    public DbSet<Notification> Notifications => Set<Notification>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // ---------------------------------------------------------------- Catalog
        modelBuilder.Entity<Category>(e =>
        {
            e.ToTable("Categories");
            e.HasKey(c => c.Id);
            e.Property(c => c.Name).HasMaxLength(120).IsRequired();
            e.Property(c => c.Slug).HasMaxLength(120).IsRequired();
            e.Property(c => c.Path).HasMaxLength(500).IsRequired();
            e.HasIndex(c => c.Slug).IsUnique();
            e.HasIndex(c => new { c.ParentId, c.Name }).IsUnique();
            e.HasIndex(c => c.Path);
            e.HasIndex(c => c.ParentId);
            e.HasOne(c => c.Parent).WithMany().HasForeignKey(c => c.ParentId).OnDelete(DeleteBehavior.Restrict);
            e.HasData(
                new Category { Id = 1, Name = "Uncategorized", Slug = "uncategorized", Path = "/uncategorized/", Depth = 1, SortOrder = 999 },
                new Category { Id = 2, Name = "Home", Slug = "home", Path = "/home/", Depth = 1 },
                new Category { Id = 3, Name = "Kitchen", Slug = "kitchen", ParentId = 2, Path = "/home/kitchen/", Depth = 2 },
                new Category { Id = 4, Name = "Coffee & Tea", Slug = "coffee-tea", ParentId = 3, Path = "/home/kitchen/coffee-tea/", Depth = 3 },
                new Category { Id = 5, Name = "Electronics", Slug = "electronics", Path = "/electronics/", Depth = 1, SortOrder = 1 },
                new Category { Id = 6, Name = "Phones", Slug = "phones", ParentId = 5, Path = "/electronics/phones/", Depth = 2 },
                new Category { Id = 7, Name = "Smartphones", Slug = "smartphones", ParentId = 6, Path = "/electronics/phones/smartphones/", Depth = 3 });
        });
        modelBuilder.Entity<ProductCategory>(e =>
        {
            e.ToTable("ProductCategories");
            e.HasKey(c => new { c.ProductId, c.CategoryId });
            e.HasIndex(c => c.ProductId).IsUnique().HasFilter("\"IsPrimary\" = TRUE");
            e.HasIndex(c => c.CategoryId);
            e.HasOne(c => c.Product).WithMany(p => p.Categories).HasForeignKey(c => c.ProductId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Category).WithMany().HasForeignKey(c => c.CategoryId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<Tag>(e => { e.ToTable("Tags"); e.HasKey(t => t.Id); e.Property(t => t.Name).HasMaxLength(80).IsRequired(); e.HasIndex(t => t.Name).IsUnique(); });
        modelBuilder.Entity<ProductTag>(e =>
        {
            e.ToTable("ProductTags"); e.HasKey(t => new { t.ProductId, t.TagId });
            e.HasOne(t => t.Product).WithMany(p => p.Tags).HasForeignKey(t => t.ProductId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.Tag).WithMany().HasForeignKey(t => t.TagId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Brand>(e =>
        {
            e.ToTable("Brands");
            e.HasKey(b => b.Id);
            e.Property(b => b.Name).HasMaxLength(120).IsRequired();
            e.Property(b => b.Slug).HasMaxLength(120).IsRequired();
            e.Property(b => b.CreatedAt);
            e.HasIndex(b => b.Slug).IsUnique();
            e.HasIndex(b => b.Name).IsUnique();
        });

        modelBuilder.Entity<ProductLine>(e =>
        {
            e.ToTable("ProductLines");
            e.HasKey(l => l.Id);
            e.Property(l => l.Name).HasMaxLength(120).IsRequired();
            e.Property(l => l.Slug).HasMaxLength(120).IsRequired();
            // Series are unique inside their brand; the same series name under two brands is legitimate.
            e.HasIndex(l => new { l.BrandId, l.Slug }).IsUnique();
            e.HasIndex(l => new { l.BrandId, l.Name }).IsUnique();
            e.HasIndex(l => l.BrandId);
            e.HasOne(l => l.Brand).WithMany(b => b.Lines).HasForeignKey(l => l.BrandId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProductImage>(e =>
        {
            e.ToTable("ProductImages");
            e.HasKey(i => i.Id);
            e.Property(i => i.Url).HasMaxLength(2048).IsRequired();
            e.Property(i => i.StoragePath).HasMaxLength(2048);
            e.Property(i => i.AltText).HasMaxLength(200);
            e.Property(i => i.CreatedAt);
            // The database, not only the service, refuses a second primary image for one product.
            e.HasIndex(i => i.ProductId).IsUnique().HasFilter("\"IsPrimary\" = TRUE");
            e.HasIndex(i => new { i.ProductId, i.SortOrder });
            e.HasOne(i => i.Product).WithMany(p => p.Images).HasForeignKey(i => i.ProductId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Product>(e =>
        {
            e.ToTable("Products");

            e.HasKey(p => p.Id);
            e.Property(p => p.Sku).HasMaxLength(64).IsRequired();
            e.Property(p => p.Slug).HasMaxLength(200).IsRequired();
            e.HasIndex(p => p.Slug).IsUnique();
            e.Property(p => p.Currency).HasMaxLength(3).IsRequired();
            e.Property(p => p.SourceName).HasMaxLength(200);
            e.Property(p => p.SourceUrl).HasMaxLength(2048);
            e.Property(p => p.SourceLicense).HasMaxLength(200);
            e.Property(p => p.PriceBasis).HasMaxLength(300);
            e.Property(p => p.Name).HasMaxLength(200).IsRequired();
            e.Property(p => p.Description).HasMaxLength(2000);
            e.Property(p => p.ImageUrl).HasMaxLength(2048);
            e.Property(p => p.Price).HasColumnType("decimal(18,2)");
            e.Property(p => p.StockQuantity).IsRequired();
            e.Property(p => p.IsActive).IsRequired();
            e.Property(p => p.RowVersion);
            e.Property(p => p.CreatedAt);
            e.Property(p => p.UpdatedAt);
            e.HasIndex(p => p.Sku).IsUnique();
            e.HasIndex(p => p.Name);
            e.HasIndex(p => p.BrandId);
            e.HasIndex(p => p.ProductLineId);
            e.HasIndex(p => new { p.IsActive, p.Price, p.Id });
            e.HasIndex(p => new { p.IsActive, p.StockQuantity, p.Id });
            e.HasIndex(p => new { p.IsActive, p.CreatedAt, p.Id });
            // Deleting a brand or series must never silently rewrite products.
            e.HasOne(p => p.Brand).WithMany().HasForeignKey(p => p.BrandId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(p => p.ProductLine).WithMany().HasForeignKey(p => p.ProductLineId).OnDelete(DeleteBehavior.Restrict);
        });

        // ---------------------------------------------------------------- Identity
        modelBuilder.Entity<Customer>(e =>
        {
            e.ToTable("Customers");
            e.HasKey(c => c.Id);
            e.Property(c => c.Name).HasMaxLength(200).IsRequired();
            e.Property(c => c.Email).HasMaxLength(256).IsRequired();
            e.Property(c => c.Phone).HasMaxLength(32);
            e.Property(c => c.CreatedAt);
            e.HasIndex(c => c.Email);
        });

        modelBuilder.Entity<Address>(e =>
        {
            e.ToTable("Addresses");
            e.HasKey(a => a.Id);
            e.Property(a => a.Label).HasMaxLength(60).IsRequired();
            e.Property(a => a.Division).HasMaxLength(80).IsRequired();
            e.Property(a => a.District).HasMaxLength(80).IsRequired();
            e.Property(a => a.Upazila).HasMaxLength(80).IsRequired();
            e.Property(a => a.AddressLine).HasMaxLength(300).IsRequired();
            e.Property(a => a.Phone).HasMaxLength(32);
            e.Property(a => a.CreatedAt);
            e.HasIndex(a => a.CustomerId);
            // At most one default address per customer, enforced by the database.
            e.HasIndex(a => a.CustomerId).IsUnique();
            e.HasOne(a => a.Customer)
                .WithMany(c => c.Addresses)
                .HasForeignKey(a => a.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Notification>(e =>
        {
            e.ToTable("Notifications");
            e.HasKey(n => n.Id);
            e.Property(n => n.Type).HasConversion<string>().HasMaxLength(32).IsRequired();
            e.Property(n => n.Title).HasMaxLength(200).IsRequired();
            e.Property(n => n.Body).HasMaxLength(500).IsRequired();
            e.Property(n => n.Link).HasMaxLength(300);
            e.Property(n => n.CreatedAt);
            e.Property(n => n.ReadAt);
            // The bell query is always "my unread, newest first" and the list page filters on it too.
            e.HasIndex(n => new { n.UserId, n.IsRead, n.CreatedAt });
            e.HasOne(n => n.User)
                .WithMany()
                .HasForeignKey(n => n.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("Users");
            e.HasKey(u => u.Id);
            e.Property(u => u.Email).HasMaxLength(256).IsRequired();
            e.Property(u => u.PasswordHash).HasMaxLength(512).IsRequired();
            e.Property(u => u.Role).HasConversion<string>().HasMaxLength(32).IsRequired();
            e.Property(u => u.CreatedAt);
            e.HasIndex(u => u.Email).IsUnique();
            e.HasOne(u => u.Customer)
                .WithMany()
                .HasForeignKey(u => u.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ---------------------------------------------------------------- Orders
        modelBuilder.Entity<Order>(e =>
        {
            e.Property(o => o.Currency).HasMaxLength(3).IsRequired();
            e.ToTable("Orders");

            e.HasKey(o => o.Id);
            e.Property(o => o.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
            e.Property(o => o.TotalAmount).HasColumnType("decimal(18,2)");
            e.Property(o => o.CreatedAt);
            e.Property(o => o.UpdatedAt);
            e.Property(o => o.IdempotencyKey).HasMaxLength(200);

            // One key per customer only: two different customers may coincidentally use the same value.
            e.HasIndex(o => new { o.CustomerId, o.IdempotencyKey }).IsUnique();

            e.HasIndex(o => o.Status);
            e.HasIndex(o => o.CreatedAt);
            e.HasIndex(o => new { o.CustomerId, o.CreatedAt });

            e.HasOne(o => o.Customer)
                .WithMany(c => c.Orders)
                .HasForeignKey(o => o.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrderItem>(e =>
        {
            e.Property(i => i.ProductName).HasMaxLength(200).IsRequired();
            e.Property(i => i.PrimaryCategoryName).HasMaxLength(120).IsRequired();
            e.ToTable("OrderItems");

            e.HasKey(i => i.Id);
            e.Property(i => i.UnitPrice).HasColumnType("decimal(18,2)");
            e.Property(i => i.LineTotal).HasColumnType("decimal(18,2)");

            // Rows are merged before insert, so this unique index is a real invariant, not decoration.
            e.HasIndex(i => new { i.OrderId, i.ProductId }).IsUnique();

            e.HasOne(i => i.Order)
                .WithMany(o => o.Items)
                .HasForeignKey(i => i.OrderId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(i => i.Product)
                .WithMany()
                .HasForeignKey(i => i.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ---------------------------------------------------------------- Inventory ledger
        modelBuilder.Entity<InventoryMovement>(e =>
        {
            e.ToTable("InventoryMovements");
            e.HasKey(m => m.Id);
            e.Property(m => m.Reason).HasMaxLength(500).IsRequired();
            e.Property(m => m.CreatedAt);
            e.HasIndex(m => m.ProductId);
            e.HasIndex(m => m.OrderId);
            e.HasIndex(m => new { m.ProductId, m.CreatedAt });

            e.HasOne(m => m.Product)
                .WithMany()
                .HasForeignKey(m => m.ProductId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(m => m.Order)
                .WithMany()
                .HasForeignKey(m => m.OrderId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ---------------------------------------------------------------- Audit + settings
        modelBuilder.Entity<AuditLog>(e =>
        {
            e.ToTable("AuditLogs");
            e.HasKey(a => a.Id);
            e.Property(a => a.Action).HasMaxLength(100).IsRequired();
            e.Property(a => a.EntityType).HasMaxLength(100).IsRequired();
            e.Property(a => a.EntityId).HasMaxLength(64);
            e.Property(a => a.Details).HasMaxLength(1000);
            e.Property(a => a.CreatedAt);
            e.HasIndex(a => a.CreatedAt);
            e.HasIndex(a => a.Action);
        });

        modelBuilder.Entity<Setting>(e =>
        {
            e.ToTable("Settings");
            e.HasKey(s => s.Key);
            e.Property(s => s.Key).HasMaxLength(100);
            e.Property(s => s.Value).HasMaxLength(500).IsRequired();
        });
    }
}
