using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace EcoHelper.DTO;

public sealed class ChatRequest
{
    [Required(ErrorMessage = "Введите сообщение.")]
    [StringLength(2000, ErrorMessage = "Сообщение не должно превышать 2000 символов.")]
    public string Message { get; set; } = string.Empty;
}

// Every key is required in the model's JSON, but extracted values may be null.
public sealed record LlmIntentResult
{
    [JsonRequired] public string Intent { get; init; } = string.Empty;
    [JsonRequired] public string? Item { get; init; }
    [JsonRequired] public string? Region { get; init; }
    [JsonRequired] public string? Settlement { get; init; }
    [JsonRequired] public string? District { get; init; }
    [JsonRequired] public string? ViolationType { get; init; }
    [JsonRequired] public string? Section { get; init; }
}

public sealed record ChatScenarioParameters(
    string? Item = null, string? Region = null, string? Settlement = null, string? District = null,
    string? ViolationType = null);

public sealed record ChatActionDto(string Label, string Url, ChatScenarioParameters? Parameters = null);

public sealed record ChatResponse(
    string Intent, string Message, IReadOnlyList<ChatActionDto> Actions,
    RecyclingSearchResponse? Recycling = null, ViolationRecommendationsResponse? Violation = null);
