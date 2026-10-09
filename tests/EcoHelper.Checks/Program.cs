using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using EcoHelper.Data;
using EcoHelper.DTO;
using EcoHelper.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

// Offline checks: synthetic provider responses, isolated in-memory SQLite, no real API key or network.
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var types = new[] { new ViolationTypeDto(1, "waste_burning", "Сжигание мусора") };
var categories = new[] { new WasteCategoryDto(1, "batteries", "Батарейки", ["батарейки"]) };
var valid = new LlmIntentResult { Intent = "find_disposal", Item = "Батарейки", City = "Москва" };
var key = "offline-test-placeholder";
var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Gemini:ApiKey"] = key }).Build();
var count = 0;
void Expect(bool condition, string message) { if (!condition) throw new Exception(message); }
async Task Check(string name, Func<Task> run) { await run(); count++; Console.WriteLine($"PASS {name}"); }
HttpResponseMessage Provider(string text, string finish = "STOP") => new(HttpStatusCode.OK)
{
    Content = JsonContent.Create(new { candidates = new[] { new { finishReason = finish, content = new { parts = new[] { new { text } } } } } })
};
GeminiIntentService Service(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) =>
    new(new HttpClient(new Handler(send)) { Timeout = Timeout.InfiniteTimeSpan }, configuration);
async Task Failure(GeminiIntentService service, string code, int status)
{
    try { await service.AnalyzeAsync("тест", categories, types, default); throw new Exception("Expected service failure"); }
    catch (LlmServiceException error)
    {
        Expect(error.Code == code && error.StatusCode == status, $"Unexpected failure: {error.Code}/{error.StatusCode}");
        Expect(!error.Message.Contains(key), "Secret exposed in public error");
    }
}

await Check("Gemini request: fixed model, secret in header only, schema, separate system/user", async () =>
{
    var service = Service(async (request, ct) =>
    {
        var body = await request.Content!.ReadAsStringAsync(ct);
        Expect(request.RequestUri!.AbsoluteUri.EndsWith($"/{GeminiIntentService.Model}:generateContent"), "Wrong model");
        Expect(request.RequestUri.Query.Length == 0, "Unexpected query string");
        Expect(request.Headers.GetValues("x-goog-api-key").Single() == key && !body.Contains(key), "Unsafe key transport");
        using var document = JsonDocument.Parse(body);
        var config = document.RootElement.GetProperty("generationConfig");
        Expect(config.GetProperty("responseMimeType").GetString() == "application/json", "JSON mode missing");
        Expect(config.GetProperty("responseJsonSchema").GetProperty("required").GetArrayLength() == 7, "Schema missing required fields");
        Expect(document.RootElement.GetProperty("contents")[0].GetProperty("parts")[0].GetProperty("text").GetString() == "тест", "User text not separated");
        return Provider(JsonSerializer.Serialize(valid, json));
    });
    Expect((await service.AnalyzeAsync("тест", categories, types, default)).City == "Москва", "Lost extraction");
});

foreach (var intent in new[] { "find_disposal", "environmental_violation", "navigation", "ecology_help", "unknown" })
    await Check($"Valid structured intent: {intent}", async () =>
    {
        var service = Service((_, _) => Task.FromResult(Provider(JsonSerializer.Serialize(new LlmIntentResult { Intent = intent }, json))));
        Expect((await service.AnalyzeAsync("тест", categories, types, default)).Intent == intent, "Intent changed");
    });

var badOutputs = new Dictionary<string, string>
{
    ["invalid JSON"] = "not json",
    ["array instead of object"] = "[]",
    ["missing field"] = "{\"intent\":\"unknown\"}",
    ["extra field"] = JsonSerializer.Serialize(valid, json).TrimEnd('}') + ",\"url\":\"https://example.com\"}",
    ["duplicate field"] = JsonSerializer.Serialize(valid, json).TrimEnd('}') + ",\"intent\":\"unknown\"}",
    ["unknown intent"] = JsonSerializer.Serialize(valid with { Intent = "execute_code" }, json),
    ["null intent"] = JsonSerializer.Serialize(valid, json).Replace("\"find_disposal\"", "null"),
    ["oversized item"] = JsonSerializer.Serialize(valid with { Item = new string('x', 121) }, json),
    ["control characters"] = JsonSerializer.Serialize(valid with { Item = "bad\nitem" }, json),
    ["arbitrary navigation URL"] = JsonSerializer.Serialize(valid with { Section = "https://example.com" }, json),
    ["invented violation type"] = JsonSerializer.Serialize(valid with { ViolationType = "invented_type" }, json),
};
// Use a JSON node to ensure the non-string test does not depend on serializer escaping.
var wrongType = JsonNode.Parse(JsonSerializer.Serialize(valid, json))!;
wrongType["city"] = 42;
badOutputs["wrong field type"] = wrongType.ToJsonString();
foreach (var (name, output) in badOutputs)
    await Check($"Reject {name}", () => Failure(Service((_, _) => Task.FromResult(Provider(output))), "invalid_output", 502));

await Check("Reject incomplete/blocked model response", () => Failure(Service((_, _) => Task.FromResult(Provider("{}", "MAX_TOKENS"))), "invalid_output", 502));
await Check("Reject empty candidates", () => Failure(Service((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { candidates = Array.Empty<object>() }) })), "invalid_output", 502));
await Check("Missing server secret is a controlled 503", async () =>
{
    var service = new GeminiIntentService(new HttpClient(new Handler((_, _) => throw new Exception("Should not send"))), new ConfigurationBuilder().Build());
    await Failure(service, "not_configured", 503);
});
foreach (var (status, body, code, exposedStatus) in new[]
{
    (400, "API key not valid", "credentials", 503),
    (400, "User location is not supported", "unsupported_location", 503),
    (404, "no longer available to new users", "model_unavailable", 503),
    (403, key, "credentials", 503),
    (400, key, "provider_http_400", 502),
})
    await Check($"Safe upstream failure: {code}", () => Failure(Service((_, _) => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(body) })), code, exposedStatus));

await Check("Quota with long Retry-After does not retry immediately", async () =>
{
    var attempts = 0;
    var service = Service((_, _) =>
    {
        attempts++;
        var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests) { Content = new StringContent("quota") };
        response.Headers.RetryAfter = new(TimeSpan.FromSeconds(30));
        return Task.FromResult(response);
    });
    await Failure(service, "quota", 429);
    Expect(attempts == 1, "Unbounded quota retry");
});
await Check("Transient 503 retries once and succeeds", async () =>
{
    var attempts = 0;
    var service = Service((_, _) => Task.FromResult(++attempts == 1
        ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) { Content = new StringContent("unavailable") }
        : Provider(JsonSerializer.Serialize(valid, json))));
    await service.AnalyzeAsync("тест", categories, types, default);
    Expect(attempts == 2, "Retry failed");
});
await Check("Network failure", () => Failure(Service((_, _) => throw new HttpRequestException("offline")), "connection", 503));
await Check("Provider timeout", () => Failure(Service((_, _) => throw new TaskCanceledException()), "timeout", 504));

await using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
await SeedData.InitializeAsync(db);
var stub = new StubLlm(valid);
var chat = new ChatService(stub, new RecyclingService(db), new ViolationService(db));
await Check("Chat disposal uses real seeded SQLite facts", async () =>
{
    var response = await chat.ReplyAsync("тест", default);
    Expect(response.Recycling?.Category?.Code == "batteries" && response.Recycling.Points.Count == 1, "Missing SQLite result");
    Expect(response.Actions.Single().Url == "/recycling.html" && response.Actions.Single().Parameters?.City == "Москва", "Missing handoff");
});
await Check("Missing city asks for it without inventing Moscow", async () =>
{
    stub.Result = valid with { City = null };
    var response = await chat.ReplyAsync("тест", default);
    Expect(response.Recycling is null && response.Actions.Single().Parameters?.City is null, "Invented city");
});
await Check("Violation routing uses SQLite recommendations and organizations", async () =>
{
    stub.Result = new() { Intent = "environmental_violation", ViolationType = "waste_burning", Location = "Москва" };
    var response = await chat.ReplyAsync("тест", default);
    Expect(response.Violation?.Type.Code == "waste_burning" && response.Violation.Organizations.Count == 2, "Wrong violation facts");
    Expect(response.Actions.Single().Parameters?.ViolationType == "waste_burning", "Missing violation handoff");
});
foreach (var (section, url) in new[] { ("home", "/"), ("recycling", "/recycling.html"), ("violations", "/violations.html"), ("assistant", "/assistant.html") })
    await Check($"Fixed navigation mapping: {section}", async () =>
    {
        stub.Result = new() { Intent = "navigation", Section = section };
        Expect((await chat.ReplyAsync("тест", default)).Actions.Single().Url == url, "Wrong URL");
    });
await Check("Unknown returns the required exact text", async () =>
{
    stub.Result = new() { Intent = "unknown" };
    var response = await chat.ReplyAsync("тест", default);
    Expect(response.Message == ChatService.UnknownMessage && response.Actions.Count == 0, "Unknown message mismatch");
});
await Check("Ecology help is server-authored capabilities, no invented facts", async () =>
{
    stub.Result = new() { Intent = "ecology_help" };
    var response = await chat.ReplyAsync("тест", default);
    Expect(response.Recycling is null && response.Violation is null && response.Actions.Count == 2, "Unexpected generated facts");
});
Console.WriteLine($"Passed {count} offline checks.");

sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request, cancellationToken);
}
sealed class StubLlm(LlmIntentResult result) : ILlmIntentService
{
    public LlmIntentResult Result { get; set; } = result;
    public Task<LlmIntentResult> AnalyzeAsync(string message, IReadOnlyList<WasteCategoryDto> categories,
        IReadOnlyList<ViolationTypeDto> types, CancellationToken cancellationToken) => Task.FromResult(Result);
}
