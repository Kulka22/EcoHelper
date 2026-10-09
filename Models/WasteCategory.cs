namespace EcoHelper.Models;

public class WasteCategory
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    // One instruction per line; the API returns an array of instructions.
    public string PreparationInstructions { get; set; } = string.Empty;
    public List<WasteCategoryAlias> Aliases { get; set; } = [];
    public List<CollectionPointWasteCategory> CollectionPointWasteCategories { get; set; } = [];
}
