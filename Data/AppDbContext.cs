using EcoHelper.Models;
using EcoHelper.Utilities;
using Microsoft.EntityFrameworkCore;

namespace EcoHelper.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<WasteCategory> WasteCategories => Set<WasteCategory>();
    public DbSet<WasteCategoryAlias> WasteCategoryAliases => Set<WasteCategoryAlias>();
    public DbSet<CollectionPoint> CollectionPoints => Set<CollectionPoint>();
    public DbSet<CollectionPointWasteCategory> CollectionPointWasteCategories => Set<CollectionPointWasteCategory>();
    public DbSet<ViolationType> ViolationTypes => Set<ViolationType>();
    public DbSet<Organization> Organizations => Set<Organization>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WasteCategory>(entity =>
        {
            entity.HasIndex(category => category.Code).IsUnique();
            entity.Property(category => category.Code).HasMaxLength(50).IsRequired();
            entity.Property(category => category.Name).HasMaxLength(120).IsRequired();
            entity.Property(category => category.PreparationInstructions).IsRequired();
        });

        modelBuilder.Entity<WasteCategoryAlias>(entity =>
        {
            entity.Property(alias => alias.Name).HasMaxLength(120).IsRequired();
            entity.Property(alias => alias.NormalizedName).HasMaxLength(120).IsRequired();
            entity.HasIndex(alias => alias.NormalizedName).IsUnique();
            entity.HasOne(alias => alias.WasteCategory).WithMany(category => category.Aliases)
                .HasForeignKey(alias => alias.WasteCategoryId);
        });

        modelBuilder.Entity<CollectionPoint>(entity =>
        {
            entity.Property(point => point.Name).HasMaxLength(200).IsRequired();
            entity.Property(point => point.Address).HasMaxLength(300).IsRequired();
            entity.Property(point => point.Region).HasMaxLength(120).IsRequired();
            entity.Property(point => point.Settlement).HasMaxLength(120);
            entity.Property(point => point.District).HasMaxLength(120);
            entity.Property(point => point.WorkingHours).HasMaxLength(300).IsRequired();
            entity.Property(point => point.Website).HasMaxLength(500);
            entity.HasIndex(point => new { point.Region, point.Settlement, point.District });
        });

        modelBuilder.Entity<CollectionPointWasteCategory>(entity =>
        {
            entity.HasKey(link => new { link.CollectionPointId, link.WasteCategoryId });
            entity.HasOne(link => link.CollectionPoint).WithMany(point => point.CollectionPointWasteCategories)
                .HasForeignKey(link => link.CollectionPointId);
            entity.HasOne(link => link.WasteCategory).WithMany(category => category.CollectionPointWasteCategories)
                .HasForeignKey(link => link.WasteCategoryId);
        });

        modelBuilder.Entity<ViolationType>(entity =>
        {
            entity.HasIndex(type => type.Code).IsUnique();
            entity.Property(type => type.Code).HasMaxLength(50).IsRequired();
            entity.Property(type => type.Name).HasMaxLength(120).IsRequired();
            entity.Property(type => type.Recommendations).IsRequired();
            entity.Property(type => type.WhatToRecord).IsRequired();
        });

        modelBuilder.Entity<Organization>(entity =>
        {
            entity.Property(organization => organization.Name).HasMaxLength(250).IsRequired();
            entity.Property(organization => organization.Region).HasMaxLength(120);
            entity.Property(organization => organization.Settlement).HasMaxLength(120);
            entity.Property(organization => organization.District).HasMaxLength(120);
            entity.Property(organization => organization.Website).HasMaxLength(500).IsRequired();
            entity.Property(organization => organization.Description).IsRequired();
            entity.HasOne(organization => organization.ViolationType).WithMany(type => type.Organizations)
                .HasForeignKey(organization => organization.ViolationTypeId);
            entity.HasIndex(organization => new { organization.ViolationTypeId, organization.Region, organization.Settlement, organization.District });
        });
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        NormalizeAliases();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        NormalizeAliases();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void NormalizeAliases()
    {
        foreach (var entry in ChangeTracker.Entries<WasteCategoryAlias>()
                     .Where(entry => entry.State is EntityState.Added or EntityState.Modified))
        {
            entry.Entity.NormalizedName = TextNormalizer.Normalize(entry.Entity.Name);
        }
    }
}
