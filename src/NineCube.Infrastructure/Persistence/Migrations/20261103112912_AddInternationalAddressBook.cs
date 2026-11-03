using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NineCube.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInternationalAddressBook : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Addresses_CustomerId",
                table: "Addresses");

            migrationBuilder.AddColumn<DateTime>(
                name: "ReservationExpiresAt",
                table: "Orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AddressLine2",
                table: "Addresses",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Company",
                table: "Addresses",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CountryCode",
                table: "Addresses",
                type: "character varying(2)",
                maxLength: 2,
                nullable: false,
                defaultValue: "BD");

            migrationBuilder.AddColumn<string>(
                name: "DeliveryInstructions",
                table: "Addresses",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Landmark",
                table: "Addresses",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PostalCode",
                table: "Addresses",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecipientName",
                table: "Addresses",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Addresses_CustomerId",
                table: "Addresses",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Addresses_DefaultCustomer",
                table: "Addresses",
                column: "CustomerId",
                unique: true,
                filter: "\"IsDefault\" = TRUE");

            migrationBuilder.Sql("""
                UPDATE "Addresses" AS a SET "IsDefault" = TRUE
                WHERE a."Id" = (
                    SELECT MIN(b."Id") FROM "Addresses" AS b WHERE b."CustomerId" = a."CustomerId")
                AND NOT EXISTS (
                    SELECT 1 FROM "Addresses" AS d WHERE d."CustomerId" = a."CustomerId" AND d."IsDefault" = TRUE);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Addresses_CustomerId",
                table: "Addresses");

            migrationBuilder.DropIndex(
                name: "IX_Addresses_DefaultCustomer",
                table: "Addresses");

            migrationBuilder.DropColumn(
                name: "ReservationExpiresAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "AddressLine2",
                table: "Addresses");

            migrationBuilder.DropColumn(
                name: "Company",
                table: "Addresses");

            migrationBuilder.DropColumn(
                name: "CountryCode",
                table: "Addresses");

            migrationBuilder.DropColumn(
                name: "DeliveryInstructions",
                table: "Addresses");

            migrationBuilder.DropColumn(
                name: "Landmark",
                table: "Addresses");

            migrationBuilder.DropColumn(
                name: "PostalCode",
                table: "Addresses");

            migrationBuilder.DropColumn(
                name: "RecipientName",
                table: "Addresses");

            migrationBuilder.CreateIndex(
                name: "IX_Addresses_CustomerId",
                table: "Addresses",
                column: "CustomerId",
                unique: true);
        }
    }
}
