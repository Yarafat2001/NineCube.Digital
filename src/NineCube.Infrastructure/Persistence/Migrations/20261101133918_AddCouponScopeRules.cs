using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace NineCube.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCouponScopeRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Exclusivity",
                table: "Coupons",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "BestOnly");

            migrationBuilder.AddColumn<decimal>(
                name: "MinEligibleAmount",
                table: "Coupons",
                type: "numeric(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ScopeMatch",
                table: "Coupons",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Any");

            migrationBuilder.CreateTable(
                name: "CouponScopeRules",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CouponId = table.Column<int>(type: "integer", nullable: false),
                    Attribute = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Polarity = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CouponScopeRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CouponScopeRules_Coupons_CouponId",
                        column: x => x.CouponId,
                        principalTable: "Coupons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CouponScopeRuleValues",
                columns: table => new
                {
                    RuleId = table.Column<int>(type: "integer", nullable: false),
                    EntityId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CouponScopeRuleValues", x => new { x.RuleId, x.EntityId });
                    table.ForeignKey(
                        name: "FK_CouponScopeRuleValues_CouponScopeRules_RuleId",
                        column: x => x.RuleId,
                        principalTable: "CouponScopeRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CouponScopeRules_CouponId",
                table: "CouponScopeRules",
                column: "CouponId");

            // A coupon written before scope rules existed carried one TargetType/TargetId pair. Reading that pair
            // as a single rule gives the matcher one source of truth without changing what any old coupon means.
            migrationBuilder.Sql("""
                INSERT INTO "CouponScopeRules" ("CouponId", "Attribute", "Polarity")
                SELECT c."Id",
                       CASE c."TargetType" WHEN 'Category' THEN 'Category'
                                           WHEN 'Brand' THEN 'Brand'
                                           ELSE 'Product' END,
                       'Is'
                FROM "Coupons" c
                WHERE c."TargetType" IN ('Category', 'Brand', 'Product') AND c."TargetId" IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM "CouponScopeRules" r WHERE r."CouponId" = c."Id");

                INSERT INTO "CouponScopeRuleValues" ("RuleId", "EntityId")
                SELECT r."Id", c."TargetId"
                FROM "CouponScopeRules" r
                JOIN "Coupons" c ON c."Id" = r."CouponId"
                WHERE c."TargetId" IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM "CouponScopeRuleValues" v WHERE v."RuleId" = r."Id");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CouponScopeRuleValues");

            migrationBuilder.DropTable(
                name: "CouponScopeRules");

            migrationBuilder.DropColumn(
                name: "Exclusivity",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "MinEligibleAmount",
                table: "Coupons");

            migrationBuilder.DropColumn(
                name: "ScopeMatch",
                table: "Coupons");
        }
    }
}
