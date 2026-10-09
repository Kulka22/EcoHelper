namespace EcoHelper.Models;

public class CollectionPointWasteCategory
{
    public int CollectionPointId { get; set; }
    public CollectionPoint CollectionPoint { get; set; } = null!;
    public int WasteCategoryId { get; set; }
    public WasteCategory WasteCategory { get; set; } = null!;
}
