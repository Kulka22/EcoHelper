namespace EcoHelper.Models;

public class WasteCategoryAlias
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string NormalizedName { get; set; } = string.Empty;
    public int WasteCategoryId { get; set; }
    public WasteCategory WasteCategory { get; set; } = null!;
}
