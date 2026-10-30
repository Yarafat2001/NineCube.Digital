using FluentValidation;
using NineCube.Application.Contracts;
using NineCube.Application.Services;

namespace NineCube.Application.Validation;

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).MaximumLength(128);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}

public sealed class CreateProductRequestValidator : AbstractValidator<CreateProductRequest>
{
    public CreateProductRequestValidator()
    {
        RuleFor(x => x.Sku).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0).LessThanOrEqualTo(1_000_000);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.ImageUrl).MaximumLength(2048).Must(ProductImageRules.IsAllowed)
            .WithMessage("Image URL must use HTTPS or a local /products/ or /uploads/ path.");
    }
}

public sealed class UpdateProductRequestValidator : AbstractValidator<UpdateProductRequest>
{
    public UpdateProductRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0).LessThanOrEqualTo(1_000_000);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.ImageUrl).MaximumLength(2048).Must(ProductImageRules.IsAllowed)
            .WithMessage("Image URL must use HTTPS or a local /products/ or /uploads/ path.");
    }
}

public sealed class StockAdjustmentRequestValidator : AbstractValidator<StockAdjustmentRequest>
{
    public StockAdjustmentRequestValidator()
    {
        RuleFor(x => x.Delta).NotEqual(0).WithMessage("Delta must be a non-zero signed integer.");
        RuleFor(x => x.Delta).InclusiveBetween(-1_000_000, 1_000_000);
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A reason is mandatory for every stock adjustment.")
            .MaximumLength(500);
    }
}

public sealed class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.Items).NotNull().Must(i => i.Count > 0)
            .WithMessage("An order must contain at least one item.");

        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.ProductId).GreaterThan(0);
            item.RuleFor(i => i.Quantity).InclusiveBetween(1, 1000)
                .WithMessage("Quantity must be a whole number between 1 and 1000.");
        });
    }
}

public sealed class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).MaximumLength(128);
        RuleFor(x => x.Role).IsInEnum();
    }
}

public sealed class ChangeUserRoleRequestValidator : AbstractValidator<ChangeUserRoleRequest>
{
    public ChangeUserRoleRequestValidator()
    {
        RuleFor(x => x.Role).IsInEnum();
    }
}

public sealed class SettingsDtoValidator : AbstractValidator<SettingsDto>
{
    public SettingsDtoValidator()
    {
        RuleFor(x => x.LowStockThreshold).InclusiveBetween(0, 10_000);
    }
}

internal static class ProductImageRules
{
    /// <summary>
    /// Images are either files the API itself serves (the seeded /products/ folder and the /uploads/
    /// store), or an absolute HTTPS URL to a host the merchant controls. Plain http is rejected so a
    /// page served over HTTPS cannot end up with blocked mixed-content images.
    /// </summary>
    public static bool IsAllowed(string? value) => string.IsNullOrWhiteSpace(value)
        || ((value.StartsWith("/products/", StringComparison.Ordinal) || value.StartsWith("/uploads/", StringComparison.Ordinal))
            && !value.Contains("..") && !value.Contains('\\'))
        || (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps);
}

public sealed class BulkProductRequestValidator : AbstractValidator<BulkProductRequest>
{
    public BulkProductRequestValidator()
    {
        RuleFor(x => x.Ids).NotNull().Must(ids => ids.Count > 0)
            .WithMessage("Select at least one product.");
        RuleFor(x => x.Ids).Must(ids => ids is not null && ids.Count <= BulkProductService.MaxIds)
            .WithMessage($"A bulk update accepts at most {BulkProductService.MaxIds} products per request.");
        RuleFor(x => x.Ids).Must(ids => ids is not null && ids.All(id => id > 0))
            .WithMessage("Every selected product needs a valid id.");
        RuleFor(x => x.Action).NotEmpty().Must(a => !string.IsNullOrWhiteSpace(a) && BulkProductActions.All.Contains(a.Trim().ToLowerInvariant()))
            .WithMessage($"action must be one of: {string.Join(", ", BulkProductActions.All)}.");
    }
}

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(20);
    }
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(8).MaximumLength(128);
    }
}

public sealed class AddressRequestValidator : AbstractValidator<AddressRequest>
{
    public AddressRequestValidator()
    {
        RuleFor(x => x.Label).NotEmpty().MaximumLength(60);
        RuleFor(x => x.Division).NotEmpty().MaximumLength(80);
        RuleFor(x => x.District).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Upazila).NotEmpty().MaximumLength(80);
        RuleFor(x => x.AddressLine).NotEmpty().MaximumLength(300);
        RuleFor(x => x.Phone).MaximumLength(20);
    }
}


public sealed class ForgotPasswordRequestValidator : AbstractValidator<ForgotPasswordRequest>
{
    public ForgotPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(8).MaximumLength(128);
    }
}

public sealed class CreateCouponRequestValidator : AbstractValidator<CreateCouponRequest>
{
    public CreateCouponRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MinimumLength(3).MaximumLength(50);
        RuleFor(x => x.DiscountValue).GreaterThan(0);
        RuleFor(x => x.MinOrderAmount).GreaterThanOrEqualTo(0);
    }
}

public sealed class ApplyCouponRequestValidator : AbstractValidator<ApplyCouponRequest>
{
    public ApplyCouponRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50);
        RuleFor(x => x.SubTotal).GreaterThan(0);
    }
}

public sealed class CreateReviewRequestValidator : AbstractValidator<CreateReviewRequest>
{
    public CreateReviewRequestValidator()
    {
        RuleFor(x => x.Rating).InclusiveBetween(1, 5).WithMessage("Rating must be between 1 and 5 stars.");
        RuleFor(x => x.Comment).MaximumLength(2000);
    }
}

public sealed class ProcessPaymentRequestValidator : AbstractValidator<ProcessPaymentRequest>
{
    public ProcessPaymentRequestValidator()
    {
        RuleFor(x => x.OrderId).GreaterThan(0);
        RuleFor(x => x.Provider).IsInEnum();
    }
}
