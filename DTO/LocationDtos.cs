using System.ComponentModel.DataAnnotations;

namespace EcoHelper.DTO;

public class LocationRequest
{
    [Required(ErrorMessage = "Укажите регион.")]
    [StringLength(120, ErrorMessage = "Название региона не должно превышать 120 символов.")]
    public string Region { get; set; } = string.Empty;

    [StringLength(120, ErrorMessage = "Название населённого пункта не должно превышать 120 символов.")]
    public string? Settlement { get; set; }

    [StringLength(120, ErrorMessage = "Название района не должно превышать 120 символов.")]
    public string? District { get; set; }

    public LocationDto ToLocation() => new(Region.Trim(), Clean(Settlement), Clean(District));
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public record LocationDto(string Region, string? Settlement, string? District);
public record LocationMatchDto(string Level, bool IsFallback);
