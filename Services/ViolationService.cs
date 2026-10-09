using System.Text.RegularExpressions;
using EcoHelper.Data;
using EcoHelper.DTO;
using EcoHelper.Utilities;
using Microsoft.EntityFrameworkCore;

namespace EcoHelper.Services;

public class ViolationService(AppDbContext db)
{
    public async Task<IReadOnlyList<ViolationTypeDto>> GetTypesAsync(CancellationToken cancellationToken) =>
        await db.ViolationTypes.AsNoTracking().OrderBy(type => type.Id)
            .Select(type => new ViolationTypeDto(type.Id, type.Code, type.Name)).ToArrayAsync(cancellationToken);

    public async Task<ViolationRecommendationsResponse?> GetRecommendationsAsync(
        ViolationRecommendationsRequest request, CancellationToken cancellationToken)
    {
        var normalizedType = TextNormalizer.Normalize(request.Type);
        var types = await db.ViolationTypes.AsNoTracking().ToListAsync(cancellationToken);
        var type = types.SingleOrDefault(type =>
            TextNormalizer.Normalize(type.Code) == normalizedType
            || TextNormalizer.Normalize(type.Name) == normalizedType
            || type.Id.ToString(System.Globalization.CultureInfo.InvariantCulture) == normalizedType);

        if (type is null)
        {
            return null;
        }

        var location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        var candidates = await db.Organizations.AsNoTracking()
            .Where(organization => organization.ViolationTypeId == type.Id)
            .OrderBy(organization => organization.Id).ToListAsync(cancellationToken);

        var matchedCities = location is null ? [] : candidates
            .Where(organization => organization.City is not null)
            .Select(organization => organization.City!).Distinct()
            .Where(city => Regex.IsMatch(TextNormalizer.Normalize(location),
                @"(?<![\p{L}\p{N}])" + Regex.Escape(TextNormalizer.City(city)) + @"(?![\p{L}\p{N}])"))
            .ToArray();
        var matchedCity = matchedCities.Length == 1 ? matchedCities[0] : null;

        var organizations = candidates
            .Where(organization => organization.City is null || organization.City == matchedCity)
            .OrderBy(organization => organization.City is null ? 1 : 0)
            .ThenBy(organization => organization.Id)
            .Select(organization => new OrganizationDto(
                organization.Id, organization.Name, organization.City, organization.Website, organization.Description))
            .ToArray();

        var message = location is null
            ? "Местоположение не указано. Показаны общие рекомендации и справочный ресурс."
            : matchedCity is null
                ? "Не удалось подобрать местную организацию из демонстрационной базы. Показаны общие рекомендации и справочный ресурс."
                : null;

        return new(new(type.Id, type.Code, type.Name), location, matchedCity, matchedCity is null,
            TextNormalizer.Lines(type.Recommendations), TextNormalizer.Lines(type.WhatToRecord),
            organizations, message, true);
    }
}
