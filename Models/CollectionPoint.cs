namespace EcoHelper.Models;

public class CollectionPoint
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string Region { get; set; } = string.Empty;
    public string? Settlement { get; set; }
    public string? District { get; set; }
    public string WorkingHours { get; set; } = string.Empty;
    public string? Website { get; set; }
    public List<CollectionPointWasteCategory> CollectionPointWasteCategories { get; set; } = [];
}
