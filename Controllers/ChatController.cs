using EcoHelper.DTO;
using EcoHelper.Services;
using Microsoft.AspNetCore.Mvc;

namespace EcoHelper.Controllers;

[ApiController]
[Route("api/chat")]
public sealed class ChatController(ChatService service, ILogger<ChatController> logger) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(16384)]
    public async Task<ActionResult<ChatResponse>> Post([FromBody] ChatRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            ModelState.AddModelError("message", "Введите сообщение.");
            return ValidationProblem(ModelState);
        }
        try { return Ok(await service.ReplyAsync(request.Message.Trim(), cancellationToken)); }
        catch (LlmServiceException error)
        {
            logger.LogWarning("Gemini intent analysis failed: {Code}", error.Code);
            if (error.StatusCode == 429) Response.Headers.RetryAfter = "30";
            return Problem(statusCode: error.StatusCode, title: "Не удалось обработать сообщение", detail: error.Message,
                extensions: new Dictionary<string, object?> { ["code"] = error.Code });
        }
    }
}
