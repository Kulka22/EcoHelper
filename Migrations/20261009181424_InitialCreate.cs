using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcoHelper.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CollectionPoints",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Address = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    City = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    District = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    WorkingHours = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    Website = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionPoints", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ViolationTypes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Code = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Recommendations = table.Column<string>(type: "TEXT", nullable: false),
                    WhatToRecord = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ViolationTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WasteCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Code = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    PreparationInstructions = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WasteCategories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Organizations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 250, nullable: false),
                    City = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    ViolationTypeId = table.Column<int>(type: "INTEGER", nullable: false),
                    Website = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Organizations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Organizations_ViolationTypes_ViolationTypeId",
                        column: x => x.ViolationTypeId,
                        principalTable: "ViolationTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CollectionPointWasteCategories",
                columns: table => new
                {
                    CollectionPointId = table.Column<int>(type: "INTEGER", nullable: false),
                    WasteCategoryId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionPointWasteCategories", x => new { x.CollectionPointId, x.WasteCategoryId });
                    table.ForeignKey(
                        name: "FK_CollectionPointWasteCategories_CollectionPoints_CollectionPointId",
                        column: x => x.CollectionPointId,
                        principalTable: "CollectionPoints",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CollectionPointWasteCategories_WasteCategories_WasteCategoryId",
                        column: x => x.WasteCategoryId,
                        principalTable: "WasteCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WasteCategoryAliases",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    NormalizedName = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    WasteCategoryId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WasteCategoryAliases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WasteCategoryAliases_WasteCategories_WasteCategoryId",
                        column: x => x.WasteCategoryId,
                        principalTable: "WasteCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionPoints_City_District",
                table: "CollectionPoints",
                columns: new[] { "City", "District" });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionPointWasteCategories_WasteCategoryId",
                table: "CollectionPointWasteCategories",
                column: "WasteCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Organizations_ViolationTypeId_City",
                table: "Organizations",
                columns: new[] { "ViolationTypeId", "City" });

            migrationBuilder.CreateIndex(
                name: "IX_ViolationTypes_Code",
                table: "ViolationTypes",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WasteCategories_Code",
                table: "WasteCategories",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WasteCategoryAliases_NormalizedName",
                table: "WasteCategoryAliases",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WasteCategoryAliases_WasteCategoryId",
                table: "WasteCategoryAliases",
                column: "WasteCategoryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CollectionPointWasteCategories");

            migrationBuilder.DropTable(
                name: "Organizations");

            migrationBuilder.DropTable(
                name: "WasteCategoryAliases");

            migrationBuilder.DropTable(
                name: "CollectionPoints");

            migrationBuilder.DropTable(
                name: "ViolationTypes");

            migrationBuilder.DropTable(
                name: "WasteCategories");
        }
    }
}
