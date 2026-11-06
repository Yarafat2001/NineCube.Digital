using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NineCube.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCatalogSearchTrigramIndexes : Migration
    {
        // Trigram indexes are declared here rather than on the model: EF collapses two indexes over the
        // same column set into one when scaffolding, which would drop the btree IX_Products_Name and the
        // unique IX_Products_Sku the catalogue sorts and the SKU constraint depend on.
        private const string TrigramIndexes = """
            CREATE INDEX IF NOT EXISTS "IX_Products_Name_Trgm" ON "Products" USING gin ("Name" gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS "IX_Products_Sku_Trgm" ON "Products" USING gin ("Sku" gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS "IX_Products_Description_Trgm" ON "Products" USING gin ("Description" gin_trgm_ops);
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.Sql("""CREATE EXTENSION IF NOT EXISTS pg_trgm;""");
            migrationBuilder.Sql(TrigramIndexes);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS "IX_Products_Description_Trgm";
                DROP INDEX IF EXISTS "IX_Products_Name_Trgm";
                DROP INDEX IF EXISTS "IX_Products_Sku_Trgm";
                """);

            migrationBuilder.AlterDatabase()
                .OldAnnotation("Npgsql:PostgresExtension:pg_trgm", ",,");
        }
    }
}
