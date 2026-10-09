using System.ComponentModel.DataAnnotations;

namespace EcoHelper.DTO;

public class RecyclingSearchRequest : LocationRequest
{
    [Required(ErrorMessage = "Укажите предмет.")]
    [StringLength(120, ErrorMessage = "Название предмета не должно превышать 120 символов.")]
    public string Item { get; set; } = string.Empty;

}

public record WasteCategorySummaryDto(int Id, string Code, string Name);
public record WasteCategoryDto(int Id, string Code, string Name, IReadOnlyList<string> Aliases);

public record CollectionPointDto(
    int Id, string Name, string Address, LocationDto Location,
    string WorkingHours, string? Website, IReadOnlyList<WasteCategorySummaryDto> AcceptedCategories);

public record RecyclingSearchResponse(
    string Item, LocationDto Location, LocationMatchDto Match, WasteCategorySummaryDto? Category,
    IReadOnlyList<string> PreparationInstructions, IReadOnlyList<CollectionPointDto> Points,
    string? Message, bool IsDemoData);
