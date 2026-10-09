using System.ComponentModel.DataAnnotations;

namespace EcoHelper.DTO;

public class RecyclingSearchRequest
{
    [Required(ErrorMessage = "Укажите предмет.")]
    [StringLength(120, ErrorMessage = "Название предмета не должно превышать 120 символов.")]
    public string Item { get; set; } = string.Empty;

    [Required(ErrorMessage = "Укажите город.")]
    [StringLength(120, ErrorMessage = "Название города не должно превышать 120 символов.")]
    public string City { get; set; } = string.Empty;

    [StringLength(120, ErrorMessage = "Название района не должно превышать 120 символов.")]
    public string? District { get; set; }
}

public record WasteCategorySummaryDto(int Id, string Code, string Name);
public record WasteCategoryDto(int Id, string Code, string Name, IReadOnlyList<string> Aliases);

public record CollectionPointDto(
    int Id, string Name, string Address, string City, string? District,
    string WorkingHours, string? Website, IReadOnlyList<WasteCategorySummaryDto> AcceptedCategories);

public record RecyclingSearchResponse(
    string Item, string City, string? District, WasteCategorySummaryDto? Category,
    IReadOnlyList<string> PreparationInstructions, IReadOnlyList<CollectionPointDto> Points,
    string? Message, bool IsDemoData);
