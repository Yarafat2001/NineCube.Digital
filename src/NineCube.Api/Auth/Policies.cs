using Microsoft.AspNetCore.Authorization;

namespace NineCube.Api.Auth;

/// <summary>
/// Role policies. The frontend hides what a role cannot use, but these policies are the real
/// enforcement - every endpoint carries one.
/// </summary>
public static class Policies
{
    public const string AnyAuthenticated = "AnyAuthenticated";
    public const string CustomerOnly = "CustomerOnly";
    public const string StaffOnly = "StaffOnly";
    public const string InventoryManagerOnly = "InventoryManagerOnly";
    public const string AdministratorOnly = "AdministratorOnly";
    public const string CustomerOrStaff = "CustomerOrStaff";
    public const string CustomerStaffOrAdmin = "CustomerStaffOrAdmin";
    public const string StaffOrAdmin = "StaffOrAdmin";
    public const string InventoryOrAdmin = "InventoryOrAdmin";
    public const string StaffInventoryOrAdmin = "StaffInventoryOrAdmin";

    public static void AddNineCubePolicies(this AuthorizationOptions options)
    {
        options.AddPolicy(AnyAuthenticated, p => p.RequireAuthenticatedUser());
        options.AddPolicy(CustomerOnly, p => p.RequireRole("Customer"));
        options.AddPolicy(StaffOnly, p => p.RequireRole("Staff"));
        options.AddPolicy(InventoryManagerOnly, p => p.RequireRole("InventoryManager"));
        options.AddPolicy(AdministratorOnly, p => p.RequireRole("Administrator"));
        options.AddPolicy(CustomerOrStaff, p => p.RequireRole("Customer", "Staff"));
        options.AddPolicy(CustomerStaffOrAdmin, p => p.RequireRole("Customer", "Staff", "Administrator"));
        options.AddPolicy(StaffOrAdmin, p => p.RequireRole("Staff", "Administrator"));
        options.AddPolicy(InventoryOrAdmin, p => p.RequireRole("InventoryManager", "Administrator"));
        options.AddPolicy(StaffInventoryOrAdmin, p => p.RequireRole("Staff", "InventoryManager", "Administrator"));

        // A policy with a custom error so a wrong-role caller always receives 403 with our contract.
        options.AddPolicy(AdministratorOnly + ".Strict", p => p.RequireRole("Administrator"));
    }
}
