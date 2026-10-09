namespace EcoHelper.Models;

public class Organization
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    // Null means a general information resource, without a city restriction.
    public string? City { get; set; }
    public int ViolationTypeId { get; set; }
    public ViolationType ViolationType { get; set; } = null!;
    public string Website { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
