using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NineCube.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCompareAtPriceAndCouponRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CompareAtPrice",
                table: "Products",
                type: "numeric(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CampaignTitle",
                table: "Coupons",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsAutomatic",
                table: "Coupons",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsBannerPromoted",
                table: "Coupons",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "MaxDiscountCap",
                table: "Coupons",
                type: "numeric(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StartsAt",
                table: "Coupons",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetId",
                table: "Coupons",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TargetType",
                table: "Coupons",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Order");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompareAtPrice",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "CampaignTitle",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "IsAutomatic",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "IsBannerPromoted",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "MaxDiscountCap",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "StartsAt",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "TargetId",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "TargetType",
                table: "Coupons");
        }
    }
}
