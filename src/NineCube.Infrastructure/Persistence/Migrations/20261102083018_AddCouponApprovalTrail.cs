using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NineCube.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCouponApprovalTrail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Coupons already on the shelf were written before any store limit existed, so none of them is
            // waiting on a review now. The default has to be a real state name: an empty string would fail
            // to materialize and take the whole coupon registry down with it.
            migrationBuilder.AddColumn<string>(
                name: "ApprovalState",
                table: "Coupons",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "NotRequired");

            migrationBuilder.AddColumn<string>(
                name: "RejectionReason",
                table: "Coupons",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReviewedAt",
                table: "Coupons",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReviewedByUserId",
                table: "Coupons",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SubmittedAt",
                table: "Coupons",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SubmittedByUserId",
                table: "Coupons",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Coupons_ApprovalState",
                table: "Coupons",
                column: "ApprovalState");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Coupons_ApprovalState",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "ApprovalState",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "RejectionReason",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "ReviewedAt",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "ReviewedByUserId",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "SubmittedAt",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "SubmittedByUserId",
                table: "Coupons");
        }
    }
}
