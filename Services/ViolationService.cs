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

        var location = request.ToLocation();
        var candidates = await db.Organizations.AsNoTracking()
            .Where(organization => organization.ViolationTypeId == type.Id)
            .OrderBy(organization => organization.Id).ToListAsync(cancellationToken);

        var (matched, match) = LocationMatcher.Find(candidates.Where(organization => organization.Region is not null),
            location, organization => organization.Region, organization => organization.Settlement, organization => organization.District);
        var organizations = matched.Concat(candidates.Where(organization => organization.Region is null))
            .Select(organization => new OrganizationDto(
                organization.Id, organization.Name, organization.Region is null ? null : new(organization.Region, organization.Settlement, organization.District), organization.Website, organization.Description))
            .ToArray();

        var message = matched.Count == 0
            ? "В указанном регионе нет подходящей организации в демонстрационной базе. Показаны общие рекомендации и справочный ресурс."
            : LocationMatcher.FallbackMessage(match);

        return new(new(type.Id, type.Code, type.Name), location, match, matched.Count == 0,
            TextNormalizer.Lines(type.Recommendations), TextNormalizer.Lines(type.WhatToRecord),
            organizations, message, true);
    }
}
