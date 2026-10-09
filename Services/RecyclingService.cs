using EcoHelper.Data;
using EcoHelper.DTO;
using EcoHelper.Utilities;
using Microsoft.EntityFrameworkCore;

namespace EcoHelper.Services;

public class RecyclingService(AppDbContext db)
{
    public async Task<IReadOnlyList<WasteCategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken)
    {
        var categories = await db.WasteCategories.AsNoTracking()
            .Include(category => category.Aliases).OrderBy(category => category.Id)
            .ToListAsync(cancellationToken);

        return categories.Select(category => new WasteCategoryDto(
            category.Id, category.Code, category.Name,
            category.Aliases.OrderBy(alias => alias.Id).Select(alias => alias.Name).ToArray())).ToArray();
    }

    public async Task<RecyclingSearchResponse> SearchAsync(
        RecyclingSearchRequest request, CancellationToken cancellationToken)
    {
        var item = request.Item.Trim();
        var city = request.City.Trim();
        var district = string.IsNullOrWhiteSpace(request.District) ? null : request.District.Trim();
        var normalizedItem = TextNormalizer.Normalize(item);

        var alias = await db.WasteCategoryAliases.AsNoTracking().Include(alias => alias.WasteCategory)
            .SingleOrDefaultAsync(alias => alias.NormalizedName == normalizedItem, cancellationToken);

        if (alias is null)
        {
            return new(item, city, district, null, [], [],
                "Предмет пока не найден в демонстрационном справочнике. Выберите известную категорию или её синоним.", true);
        }

        var category = alias.WasteCategory;
        var candidates = await db.CollectionPoints.AsNoTracking()
            .Where(point => point.CollectionPointWasteCategories.Any(link => link.WasteCategoryId == category.Id))
            .Include(point => point.CollectionPointWasteCategories).ThenInclude(link => link.WasteCategory)
            .OrderBy(point => point.Id).ToListAsync(cancellationToken);

        // The demo catalogue is small. Compare Russian location names in .NET after the DB category filter.
        var normalizedCity = TextNormalizer.City(city);
        var normalizedDistrict = TextNormalizer.District(district);
        var points = candidates
            .Where(point => TextNormalizer.City(point.City) == normalizedCity)
            .Where(point => district is null || TextNormalizer.District(point.District) == normalizedDistrict)
            .Select(point => new CollectionPointDto(
                point.Id, point.Name, point.Address, point.City, point.District,
                point.WorkingHours, point.Website,
                point.CollectionPointWasteCategories.OrderBy(link => link.WasteCategoryId)
                    .Select(link => new WasteCategorySummaryDto(
                        link.WasteCategory.Id, link.WasteCategory.Code, link.WasteCategory.Name)).ToArray()))
            .ToArray();

        return new(item, city, district, new(category.Id, category.Code, category.Name),
            TextNormalizer.Lines(category.PreparationInstructions), points,
            points.Length == 0 ? "В выбранном городе или районе нет подходящих пунктов в демонстрационной базе." : null,
            true);
    }
}
