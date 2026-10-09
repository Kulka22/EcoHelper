using System.ComponentModel.DataAnnotations;

namespace EcoHelper.DTO;

public class ViolationRecommendationsRequest : LocationRequest
{
    [Required(ErrorMessage = "Выберите тип нарушения из /api/violations/types или определите его через /api/violations/resolve-type.")]
    [StringLength(120, ErrorMessage = "Тип нарушения не должен превышать 120 символов.")]
    public string Type { get; set; } = string.Empty;

}

public sealed class ViolationTypeResolutionRequest
{
    [StringLength(120, ErrorMessage = "Тип нарушения не должен превышать 120 символов.")]
    public string? Type { get; set; }

    [StringLength(1500, ErrorMessage = "Описание не должно превышать 1500 символов.")]
    public string? Description { get; set; }
}

public record ViolationTypeDto(int Id, string Code, string Name);
public record OrganizationDto(int Id, string Name, LocationDto? Location, string Website, string Description);

public record ViolationRecommendationsResponse(
    ViolationTypeDto Type, LocationDto Location, LocationMatchDto Match, bool IsGeneralAdvice,
    IReadOnlyList<string> Recommendations, IReadOnlyList<string> WhatToRecord,
    IReadOnlyList<OrganizationDto> Organizations, string? Message, bool IsDemoData);
