using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using NineCube.Domain;

namespace NineCube.Application.Abstractions;

/// <summary>
/// The persistence surface the application services are allowed to use.
/// Deliberately EF-shaped: at this size an extra repository abstraction would buy
/// nothing but indirection, and it would hide the atomic conditional updates that
/// are the whole point of the design.
/// </summary>
public interface IAppDbContext
{
    DbSet<Product> Products { get; }
    DbSet<Category> Categories { get; }
    DbSet<ProductCategory> ProductCategories { get; }
    DbSet<Tag> Tags { get; }
    DbSet<ProductTag> ProductTags { get; }
    DbSet<Brand> Brands { get; }
    DbSet<ProductLine> ProductLines { get; }
    DbSet<ProductImage> ProductImages { get; }
    DbSet<Customer> Customers { get; }
    DbSet<User> Users { get; }
    DbSet<Order> Orders { get; }
    DbSet<OrderItem> OrderItems { get; }
    DbSet<InventoryMovement> InventoryMovements { get; }
    DbSet<AuditLog> AuditLogs { get; }
    DbSet<Setting> Settings { get; }
    DbSet<Address> Addresses { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<Coupon> Coupons { get; }
    DbSet<GiftCard> GiftCards { get; }
    DbSet<PaymentTransaction> PaymentTransactions { get; }
    DbSet<PasswordResetToken> PasswordResetTokens { get; }
    DbSet<ProductReview> ProductReviews { get; }
    DbSet<WishlistItem> WishlistItems { get; }
    DbSet<RefreshToken> RefreshTokens { get; }

    DatabaseFacade Database { get; }
    Microsoft.EntityFrameworkCore.ChangeTracking.ChangeTracker ChangeTracker { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

/// <summary>Ambient information about the caller of the current request.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    int? UserId { get; }
    string? Email { get; }
    UserRole? Role { get; }
    int? CustomerId { get; }
    bool IsInRole(params UserRole[] roles);
}

public sealed record TokenResult(string AccessToken, DateTime ExpiresAtUtc);

public interface IJwtTokenService
{
    TokenResult CreateAccessToken(User user);
}

public interface IPasswordHasherService
{
    string Hash(string password);
    bool Verify(string password, string hash);
}

public interface IClock
{
    DateTime UtcNow { get; }
}

/// <summary>High-performance in-memory and distributed caching abstraction.</summary>
public interface ICacheService
{
    Task<T> GetOrCreateAsync<T>(string key, Func<CancellationToken, Task<T>> factory, TimeSpan? expiration = null, CancellationToken ct = default);
    void Remove(string key);
    void RemoveByPrefix(string prefix);
}

/// <summary>Reads and writes the DB-backed application settings (e.g. low stock threshold).</summary>
public interface ISettingsService
{
    Task<int> GetLowStockThresholdAsync(CancellationToken ct = default);
    Task SetLowStockThresholdAsync(int value, CancellationToken ct = default);
}

/// <summary>
/// Durable storage for uploaded product media. Files live outside the web root's source tree and are
/// served from a fixed public prefix, so the returned url is what clients put in an img src.
/// </summary>
public interface IProductStorage
{
    /// <summary>The public path prefix uploads are served from, e.g. "/uploads".</summary>
    string PublicPrefix { get; }

    /// <summary>Absolute file system directory the API serves from and writes to. Survives restarts.</summary>
    string RootPath { get; }

    /// <summary>Stores the stream under a generated file name and returns the public url ("/uploads/&lt;guid&gt;.jpg").</summary>
    Task<string> StoreAsync(Stream content, string extension, CancellationToken ct = default);

    /// <summary>Deletes a previously stored file. A missing file or a url outside the storage prefix is ignored.</summary>
    Task DeleteAsync(string? publicUrl, CancellationToken ct = default);

    /// <summary>True when the file behind a stored url is present on disk.</summary>
    Task<bool> ExistsAsync(string? publicUrl, CancellationToken ct = default);
}

public static class SettingKeys
{
    public const string LowStockThreshold = "LowStockThreshold";
}

public static class AuditActions
{
    public const string UserRegistered = "user.registered";
    public const string UserLoggedIn = "user.login";
    public const string UserLoginFailed = "user.login.failed";
    public const string UserCreated = "user.created";
    public const string UserRoleChanged = "user.role.changed";
    public const string UserActivated = "user.activated";
    public const string UserDeactivated = "user.deactivated";
    public const string UserPasswordChanged = "user.password.changed";
    public const string CustomerProfileUpdated = "customer.profile.updated";
    public const string ProductCreated = "product.created";
    public const string ProductUpdated = "product.updated";
    public const string ProductBulkUpdated = "product.bulk.updated";
    public const string ProductImageUploaded = "product.image.uploaded";
    public const string ProductImageDeleted = "product.image.deleted";
    public const string ProductImagePromoted = "product.image.primary";
    public const string StockAdjusted = "stock.adjusted";
    public const string OrderPlaced = "order.placed";
    public const string OrderConfirmed = "order.confirmed";
    public const string OrderRejected = "order.rejected";
    public const string OrderShipped = "order.shipped";
    public const string OrderCancelled = "order.cancelled";
    public const string SettingsUpdated = "settings.updated";
}

public interface IEmailSender
{
    Task SendEmailAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default);
}
