using System.ComponentModel.DataAnnotations;

namespace EcoHelper.DTO;

public class ViolationRecommendationsRequest
{
    [Required(ErrorMessage = "Выберите тип нарушения из /api/violations/types. Распознавание свободного текста пока не подключено.")]
    [StringLength(120, ErrorMessage = "Тип нарушения не должен превышать 120 символов.")]
    public string Type { get; set; } = string.Empty;

    [StringLength(300, ErrorMessage = "Местоположение не должно превышать 300 символов.")]
    public string? Location { get; set; }
}

public record ViolationTypeDto(int Id, string Code, string Name);
public record OrganizationDto(int Id, string Name, string? City, string Website, string Description);

public record ViolationRecommendationsResponse(
    ViolationTypeDto Type, string? Location, string? MatchedCity, bool IsGeneralAdvice,
    IReadOnlyList<string> Recommendations, IReadOnlyList<string> WhatToRecord,
    IReadOnlyList<OrganizationDto> Organizations, string? Message, bool IsDemoData);
