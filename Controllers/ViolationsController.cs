using EcoHelper.DTO;
using EcoHelper.Services;
using Microsoft.AspNetCore.Mvc;

namespace EcoHelper.Controllers;

[ApiController]
[Route("api/violations")]
public class ViolationsController(ViolationService service) : ControllerBase
{
    [HttpGet("types")]
    public async Task<ActionResult<IReadOnlyList<ViolationTypeDto>>> GetTypes(CancellationToken cancellationToken) =>
        Ok(await service.GetTypesAsync(cancellationToken));

    [HttpGet("recommendations")]
    public async Task<ActionResult<ViolationRecommendationsResponse>> GetRecommendations(
        [FromQuery] ViolationRecommendationsRequest request, CancellationToken cancellationToken)
    {
        var response = await service.GetRecommendationsAsync(request, cancellationToken);
        if (response is null)
        {
            ModelState.AddModelError("type",
                "Неизвестный тип нарушения. Выберите тип из /api/violations/types. Распознавание свободного текста пока не подключено.");
            return ValidationProblem(ModelState);
        }

        return Ok(response);
    }
}
