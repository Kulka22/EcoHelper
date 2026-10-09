using EcoHelper.DTO;

namespace EcoHelper.Utilities;

public static class LocationMatcher
{
    public static (IReadOnlyList<T> Items, LocationMatchDto Match) Find<T>(IEnumerable<T> source,
        LocationDto requested, Func<T, string?> region, Func<T, string?> settlement, Func<T, string?> district)
    {
        var candidates = source.Where(item => TextNormalizer.Region(region(item)) == TextNormalizer.Region(requested.Region)).ToArray();
        var hasSettlement = !string.IsNullOrWhiteSpace(requested.Settlement);
        var hasDistrict = !string.IsNullOrWhiteSpace(requested.District);
        var levels = new List<(string Name, bool Settlement, bool District)>();
        if (hasSettlement && hasDistrict) levels.Add(("region_settlement_district", true, true));
        if (hasSettlement) levels.Add(("region_settlement", true, false));
        if (hasDistrict) levels.Add(("region_district", false, true));
        levels.Add(("region", false, false));
        foreach (var level in levels)
        {
            var found = candidates.Where(item =>
                (!level.Settlement || TextNormalizer.Settlement(settlement(item)) == TextNormalizer.Settlement(requested.Settlement)) &&
                (!level.District || TextNormalizer.District(district(item)) == TextNormalizer.District(requested.District))).ToArray();
            if (found.Length > 0) return (found, new(level.Name, level.Name != levels[0].Name));
        }
        return (Array.Empty<T>(), new("none", false));
    }

    public static string? FallbackMessage(LocationMatchDto match) => !match.IsFallback ? null : match.Level switch
    {
        "region_settlement" => "Точных совпадений нет. Показаны варианты по региону и населённому пункту, без ограничения по району.",
        "region_district" => "Точных совпадений нет. Показаны варианты по региону и району, без ограничения по населённому пункту.",
        _ => "Точных совпадений нет. Показаны варианты по всему указанному региону."
    };
}
