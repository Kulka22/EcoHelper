namespace EcoHelper.Models;

public class Organization
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    // Null region means a general information resource, without a location restriction.
    public string? Region { get; set; }
    public string? Settlement { get; set; }
    public string? District { get; set; }
    public int ViolationTypeId { get; set; }
    public ViolationType ViolationType { get; set; } = null!;
    public string Website { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
