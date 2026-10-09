namespace EcoHelper.Models;

public class ViolationType
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Recommendations { get; set; } = string.Empty;
    public string WhatToRecord { get; set; } = string.Empty;
    public List<Organization> Organizations { get; set; } = [];
}
