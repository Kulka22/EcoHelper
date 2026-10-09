using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcoHelper.Migrations
{
    /// <inheritdoc />
    public partial class UnifiedLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Organizations_ViolationTypeId_City",
                table: "Organizations");

            migrationBuilder.DropIndex(
                name: "IX_CollectionPoints_City_District",
                table: "CollectionPoints");

            migrationBuilder.RenameColumn(
                name: "City",
                table: "Organizations",
                newName: "Region");

            migrationBuilder.RenameColumn(
                name: "City",
                table: "CollectionPoints",
                newName: "Region");

            migrationBuilder.AddColumn<string>(
                name: "District",
                table: "Organizations",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Settlement",
                table: "Organizations",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Settlement",
                table: "CollectionPoints",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Organizations_ViolationTypeId_Region_Settlement_District",
                table: "Organizations",
                columns: new[] { "ViolationTypeId", "Region", "Settlement", "District" });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionPoints_Region_Settlement_District",
                table: "CollectionPoints",
                columns: new[] { "Region", "Settlement", "District" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Organizations_ViolationTypeId_Region_Settlement_District",
                table: "Organizations");

            migrationBuilder.DropIndex(
                name: "IX_CollectionPoints_Region_Settlement_District",
                table: "CollectionPoints");

            migrationBuilder.DropColumn(
                name: "District",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "Settlement",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "Settlement",
                table: "CollectionPoints");

            migrationBuilder.RenameColumn(
                name: "Region",
                table: "Organizations",
                newName: "City");

            migrationBuilder.RenameColumn(
                name: "Region",
                table: "CollectionPoints",
                newName: "City");

            migrationBuilder.CreateIndex(
                name: "IX_Organizations_ViolationTypeId_City",
                table: "Organizations",
                columns: new[] { "ViolationTypeId", "City" });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionPoints_City_District",
                table: "CollectionPoints",
                columns: new[] { "City", "District" });
        }
    }
}
