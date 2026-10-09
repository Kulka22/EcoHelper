using EcoHelper.Data;
using EcoHelper.DTO;
using EcoHelper.Utilities;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

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
        var location = request.ToLocation();
        var normalizedItem = TextNormalizer.Normalize(item);

        var alias = await db.WasteCategoryAliases.AsNoTracking().Include(alias => alias.WasteCategory)
            .SingleOrDefaultAsync(alias => alias.NormalizedName == normalizedItem, cancellationToken);

        if (alias is null)
        {
            var aliases = await db.WasteCategoryAliases.AsNoTracking().Include(candidate => candidate.WasteCategory)
                .ToListAsync(cancellationToken);
            var mentioned = aliases.Where(candidate => Regex.IsMatch(normalizedItem, AliasPattern(candidate.NormalizedName))).ToArray();
            // Mixed categories are ambiguous: never choose one just because it matched first.
            if (mentioned.Select(candidate => candidate.WasteCategoryId).Distinct().Count() == 1)
                alias = mentioned.FirstOrDefault(candidate => MatchesItemWithDetails(normalizedItem, candidate.NormalizedName));
        }

        if (alias is null)
        {
            return new(item, location, new("none", false), null, [], [],
                "Предмет пока не найден в демонстрационном справочнике. Выберите известную категорию или её синоним.", true);
        }

        var category = alias.WasteCategory;
        var candidates = await db.CollectionPoints.AsNoTracking()
            .Where(point => point.CollectionPointWasteCategories.Any(link => link.WasteCategoryId == category.Id))
            .Include(point => point.CollectionPointWasteCategories).ThenInclude(link => link.WasteCategory)
            .OrderBy(point => point.Id).ToListAsync(cancellationToken);

        var (matched, match) = LocationMatcher.Find(candidates, location, point => point.Region, point => point.Settlement, point => point.District);
        var points = matched
            .Select(point => new CollectionPointDto(
                point.Id, point.Name, point.Address, new(point.Region, point.Settlement, point.District),
                point.WorkingHours, point.Website,
                point.CollectionPointWasteCategories.OrderBy(link => link.WasteCategoryId)
                    .Select(link => new WasteCategorySummaryDto(
                        link.WasteCategory.Id, link.WasteCategory.Code, link.WasteCategory.Name)).ToArray()))
            .ToArray();

        return new(item, location, match, new(category.Id, category.Code, category.Name),
            TextNormalizer.Lines(category.PreparationInstructions), points,
            points.Length == 0 ? "В указанном регионе нет подходящих пунктов в демонстрационной базе." : LocationMatcher.FallbackMessage(match),
            true);
    }

    private static bool MatchesItemWithDetails(string item, string alias)
    {
        var pattern = AliasPattern(alias);
        if (!Regex.IsMatch(item, pattern)) return false;
        var remainder = Regex.Replace(item, pattern, " ");
        // Allow model/brand markings and a small set of neutral qualifiers, not arbitrary prose.
        string[] qualifiers = ["старый", "старая", "старое", "старые", "использованные", "отработанные",
            "ненужные", "разряженные", "аа", "ааа", "мл", "л", "г", "кг", "шт", "в", "вт"];
        return Regex.Matches(remainder, @"[\p{L}\p{N}_]+")
            .All(token => Regex.IsMatch(token.Value, @"^[a-z0-9]+$") || qualifiers.Contains(token.Value));
    }

    private static string AliasPattern(string alias) =>
        @"(?<![\p{L}\p{N}_])" + Regex.Escape(alias) + @"(?![\p{L}\p{N}_])";
}
