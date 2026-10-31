using Microsoft.Extensions.DependencyInjection;
using NineCube.Application.Abstractions;
using NineCube.Application.Services;

namespace NineCube.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAuditWriter, AuditWriter>();
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IPasswordResetService, PasswordResetService>();
        services.AddScoped<ICouponService, CouponService>();
        services.AddScoped<IGiftCardService, GiftCardService>();
        services.AddScoped<IPaymentService, PaymentService>();
        services.AddScoped<IReviewService, ReviewService>();
        services.AddScoped<IWishlistService, WishlistService>();
        services.AddScoped<ICatalogService, CatalogService>();
        services.AddScoped<IBrandService, BrandService>();
        services.AddScoped<IProductImageService, ProductImageService>();
        services.AddScoped<CategoryService>();
        services.AddScoped<IInventoryService, InventoryService>();
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<IBulkProductService, BulkProductService>();
        services.AddScoped<NotificationService>();
        services.AddScoped<INotificationWriter>(sp => sp.GetRequiredService<NotificationService>());
        services.AddScoped<INotificationService>(sp => sp.GetRequiredService<NotificationService>());
        services.AddScoped<IProfileService, ProfileService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<IAdminService, AdminService>();

        return services;
    }
}
