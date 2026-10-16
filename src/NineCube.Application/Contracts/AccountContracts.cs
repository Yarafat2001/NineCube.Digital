using NineCube.Domain;

namespace NineCube.Application.Contracts;

// ---------------------------------------------------------------- notifications

/// <summary>One inbox row. Type travels as its string name so clients can branch without numbering.</summary>
public sealed record NotificationDto(
    int Id,
    NotificationType Type,
    string Title,
    string Body,
    string? Link,
    bool IsRead,
    DateTime CreatedAt,
    DateTime? ReadAt);

public sealed record UnreadCountDto(int Count);

// ---------------------------------------------------------------- profile

public sealed record AddressDto(
    int Id,
    string Label,
    string Division,
    string District,
    string Upazila,
    string AddressLine,
    string? Phone,
    bool IsDefault);

public sealed record AddressRequest(
    string Label,
    string Division,
    string District,
    string Upazila,
    string AddressLine,
    string? Phone = null,
    bool IsDefault = false);

/// <summary>Email is the login identity and is therefore read-only on the profile page.</summary>
public sealed record ProfileDto(
    int Id,
    string Name,
    string Email,
    string? Phone,
    UserRole Role,
    DateTime CreatedAt,
    IReadOnlyList<AddressDto> Addresses);

public sealed record UpdateProfileRequest(string Name, string? Phone);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

// ---------------------------------------------------------------- customer dashboard

public sealed record StatusCountDto(string Status, int Count);

public sealed record DashboardOrderDto(
    int Id,
    string Status,
    decimal TotalAmount,
    string Currency,
    DateTime CreatedAt,
    int ItemCount);

public sealed record DashboardDto(
    int TotalOrders,
    IReadOnlyList<StatusCountDto> OrdersByStatus,
    decimal TotalSpent,
    string Currency,
    int TotalItems,
    IReadOnlyList<DashboardOrderDto> RecentOrders,
    IReadOnlyList<NotificationDto> RecentNotifications,
    int UnreadNotifications);

// ---------------------------------------------------------------- bulk product edits

/// <summary>
/// The allowed bulk actions, as the exact strings the API accepts. Anything else is a 400.
/// Stock is deliberately absent: it only ever changes through the atomic conditional update
/// path in InventoryService, which cannot be batched safely.
/// </summary>
public static class BulkProductActions
{
    public const string SetCategory = "set-category";
    public const string AddTags = "add-tags";
    public const string RemoveTags = "remove-tags";
    public const string Activate = "activate";
    public const string Deactivate = "deactivate";
    public const string AssignBrand = "assign-brand";

    public static readonly string[] All =
    [
        SetCategory, AddTags, RemoveTags, Activate, Deactivate, AssignBrand
    ];
}

public sealed record BulkProductParams(
    int? CategoryId = null,
    IReadOnlyList<string>? Tags = null,
    int? BrandId = null,
    int? ProductLineId = null);

public sealed record BulkProductRequest(
    IReadOnlyList<int> Ids,
    string Action,
    BulkProductParams? Params = null);

/// <summary>Result for a single id. <paramref name="Result"/> is updated, skipped or failed.</summary>
public sealed record BulkItemResult(int Id, string? Sku, string? Name, string Result, string? Reason = null);

public sealed record BulkProductResultDto(
    string Action,
    int Requested,
    int Updated,
    int Skipped,
    int Failed,
    IReadOnlyList<BulkItemResult> Items);
