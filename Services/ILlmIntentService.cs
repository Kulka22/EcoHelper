using EcoHelper.DTO;

namespace EcoHelper.Services;

public interface ILlmIntentService
{
    Task<LlmIntentResult> AnalyzeAsync(string message,
        IReadOnlyList<WasteCategoryDto> categories, IReadOnlyList<ViolationTypeDto> violationTypes,
        CancellationToken cancellationToken);
}

public sealed class LlmServiceException(string code, int statusCode, string message) : Exception(message)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}
