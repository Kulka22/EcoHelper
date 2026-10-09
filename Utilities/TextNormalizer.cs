using System.Text.RegularExpressions;

namespace EcoHelper.Utilities;

public static class TextNormalizer
{
    // Normalize in .NET: SQLite's default case-insensitive matching does not cover Cyrillic.
    public static string Normalize(string? value) =>
        Regex.Replace((value ?? string.Empty).Trim().ToLowerInvariant().Replace('ё', 'е'), @"\s+", " ");

    public static string City(string? value) =>
        Regex.Replace(Normalize(value), @"^(?:город\s+|г\.\s*|г\s+)", string.Empty);

    public static string District(string? value) =>
        Regex.Replace(Regex.Replace(Normalize(value), @"^(?:район|р-н)\s+", string.Empty),
            @"\s+(?:район|р-н)$", string.Empty);

    public static string[] Lines(string value) =>
        value.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
}
