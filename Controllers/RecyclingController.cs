using EcoHelper.DTO;
using EcoHelper.Services;
using Microsoft.AspNetCore.Mvc;

namespace EcoHelper.Controllers;

[ApiController]
[Route("api/recycling")]
public class RecyclingController(RecyclingService service) : ControllerBase
{
    [HttpGet("categories")]
    public async Task<ActionResult<IReadOnlyList<WasteCategoryDto>>> GetCategories(CancellationToken cancellationToken) =>
        Ok(await service.GetCategoriesAsync(cancellationToken));

    [HttpGet("search")]
    public async Task<ActionResult<RecyclingSearchResponse>> Search(
        [FromQuery] RecyclingSearchRequest request, CancellationToken cancellationToken) =>
        Ok(await service.SearchAsync(request, cancellationToken));
}
