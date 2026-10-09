using EcoHelper.DTO;
using EcoHelper.Services;
using Microsoft.AspNetCore.Mvc;

namespace EcoHelper.Controllers;

[ApiController]
[Route("api/violations")]
public class ViolationsController(ViolationService service, ILlmIntentService llm,
    ILogger<ViolationsController> logger) : ControllerBase
{
    [HttpGet("types")]
    public async Task<ActionResult<IReadOnlyList<ViolationTypeDto>>> GetTypes(CancellationToken cancellationToken) =>
        Ok(await service.GetTypesAsync(cancellationToken));

    [HttpPost("resolve-type")]
    [RequestSizeLimit(16384)]
    public async Task<ActionResult<ViolationTypeDto>> ResolveType(
        [FromBody] ViolationTypeResolutionRequest request, CancellationToken cancellationToken)
    {
        var types = await service.GetTypesAsync(cancellationToken);
        // A supplied ready type always takes precedence, even if the description contradicts it.
        // An invalid explicit type is a validation error; it must not silently fall back to Gemini.
        if (!string.IsNullOrWhiteSpace(request.Type))
        {
            var chosen = types.SingleOrDefault(type => type.Code == request.Type.Trim());
            if (chosen is not null) return Ok(chosen);
            ModelState.AddModelError("type", "Выберите существующий тип нарушения.");
            return ValidationProblem(ModelState);
        }
        if (string.IsNullOrWhiteSpace(request.Description))
        {
            ModelState.AddModelError("description", "Выберите тип нарушения или опишите ситуацию.");
            return ValidationProblem(ModelState);
        }

        try
        {
            var analysis = await llm.AnalyzeAsync(request.Description.Trim(), [], types, cancellationToken);
            var recognized = analysis.Intent == "environmental_violation"
                ? types.SingleOrDefault(type => type.Code == analysis.ViolationType) : null;
            if (recognized is null)
                return Problem(statusCode: 422, title: "Тип нарушения не определён",
                    detail: "Не удалось определить поддерживаемый тип нарушения. Уточните описание или выберите готовый тип.",
                    extensions: new Dictionary<string, object?> { ["code"] = "violation_type_unknown" });
            return Ok(recognized);
        }
        catch (LlmServiceException error)
        {
            logger.LogWarning("Violation type analysis failed: {Code}", error.Code);
            if (error.StatusCode == 429) Response.Headers.RetryAfter = "30";
            return Problem(statusCode: error.StatusCode, title: "Не удалось определить тип нарушения", detail: error.Message,
                extensions: new Dictionary<string, object?> { ["code"] = error.Code });
        }
    }

    [HttpGet("recommendations")]
    public async Task<ActionResult<ViolationRecommendationsResponse>> GetRecommendations(
        [FromQuery] ViolationRecommendationsRequest request, CancellationToken cancellationToken)
    {
        var response = await service.GetRecommendationsAsync(request, cancellationToken);
        if (response is null)
        {
            ModelState.AddModelError("type",
                "Неизвестный тип нарушения. Выберите тип из /api/violations/types или определите его через /api/violations/resolve-type.");
            return ValidationProblem(ModelState);
        }

        return Ok(response);
    }
}
