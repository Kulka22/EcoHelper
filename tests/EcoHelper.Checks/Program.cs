using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using EcoHelper.Data;
using EcoHelper.Controllers;
using EcoHelper.DTO;
using EcoHelper.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

// Offline checks: synthetic provider responses, isolated in-memory SQLite, no real API key or network.
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var types = new[] { new ViolationTypeDto(1, "waste_burning", "Сжигание мусора") };
var categories = new[] { new WasteCategoryDto(1, "batteries", "Батарейки", ["батарейки"]) };
var valid = new LlmIntentResult { Intent = "find_disposal", Item = "Батарейки", Region = "Москва" };
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
        Expect(config.GetProperty("responseJsonSchema").GetProperty("properties").GetProperty("region").GetProperty("description").GetString()!.Contains("каноническое"), "Region normalization instruction missing");
        Expect(document.RootElement.GetProperty("contents")[0].GetProperty("parts")[0].GetProperty("text").GetString() == "тест", "User text not separated");
        return Provider(JsonSerializer.Serialize(valid, json));
    });
    Expect((await service.AnalyzeAsync("тест", categories, types, default)).Region == "Москва", "Lost extraction");
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
wrongType["region"] = 42;
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
    Expect(response.Actions.Single().Url == "/recycling.html" && response.Actions.Single().Parameters?.Region == "Москва", "Missing handoff");
});
await Check("Missing region asks for it without inventing Moscow", async () =>
{
    stub.Result = valid with { Region = null };
    var response = await chat.ReplyAsync("тест", default);
    Expect(response.Recycling is null && response.Actions.Single().Parameters?.Region is null, "Invented region");
});
await Check("Violation routing uses SQLite recommendations and organizations", async () =>
{
    stub.Result = new() { Intent = "environmental_violation", ViolationType = "waste_burning", Region = "Москва" };
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
var violationService = new ViolationService(db);
var recyclingService = new RecyclingService(db);
foreach (var (region, settlement, district, level, size, fallback) in new (string, string?, string?, string, int, bool)[]
{
    ("Ленинградская область", "Всеволожск", "Всеволожский", "region_settlement_district", 1, false),
    ("Ленинградская область", "Всеволожск", "Гатчинский", "region_settlement", 1, true),
    ("Ленинградская область", "Неизвестный", "Всеволожский", "region_district", 2, true),
    ("Ленинградская область", "Неизвестный", "Неизвестный", "region", 3, true),
    ("Ленинградская область", "Всеволожск", null, "region_settlement", 1, false),
    ("Ленинградская область", null, "Всеволожский", "region_district", 2, false),
    ("Ленинградская область", null, null, "region", 3, false),
    ("Санкт-Петербург", null, "Петроградский", "region_district", 1, false),
    ("Неизвестный регион", "Всеволожск", "Всеволожский", "none", 0, false)
})
    await Check($"Shared location fallback: {region}/{settlement}/{district} -> {level}", async () =>
    {
        var recycling = await recyclingService.SearchAsync(new() { Item = "Батарейки", Region = region, Settlement = settlement, District = district }, default);
        var violation = await violationService.GetRecommendationsAsync(new() { Type = "waste_burning", Region = region, Settlement = settlement, District = district }, default);
        Expect(recycling.Match.Level == level && recycling.Match.IsFallback == fallback && recycling.Points.Count == size, "Wrong recycling fallback");
        Expect(violation?.Match == recycling.Match && violation.Organizations.Count(organization => organization.Location is not null) == size, "Scenarios use different matching");
        Expect(recycling.Points.All(point => point.Location.Region == region), "Search escaped requested region");
        Expect(violation!.Organizations.Count(organization => organization.Location is null) == 1, "Missing general resource");
        if (fallback) Expect(recycling.Message is not null && violation.Message is not null, "Broadened search is silent");
    });
await Check("Shared location normalization keeps Cyrillic, prefixes and district suffix", async () =>
{
    var result = await recyclingService.SearchAsync(new() { Item = "Батарейки", Region = " ЛЕНИНГРАДСКАЯ ОБЛАСТЬ ", Settlement = "г. ВСЕВОЛОЖСК", District = "Всеволожский район" }, default);
    Expect(result.Match.Level == "region_settlement_district" && result.Points.Count == 1, "Literal normalization failed");
});
await Check("Updated regional seed is idempotent", async () =>
{
    var points = await db.CollectionPoints.CountAsync();
    var organizations = await db.Organizations.CountAsync();
    await SeedData.InitializeAsync(db);
    Expect(points == await db.CollectionPoints.CountAsync() && organizations == await db.Organizations.CountAsync(), "Regional demo rows duplicated");
});
await Check("Migration preserves old city data as region", async () =>
{
    await using var legacyConnection = new SqliteConnection("Data Source=:memory:");
    await legacyConnection.OpenAsync();
    await using var legacyDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(legacyConnection).Options);
    var migrator = legacyDb.GetService<IMigrator>();
    await migrator.MigrateAsync("20261009181424_InitialCreate");
    await legacyDb.Database.ExecuteSqlRawAsync("""
        INSERT INTO CollectionPoints (Name, Address, City, District, WorkingHours) VALUES ('Legacy point', 'Address', 'Москва', 'Арбат', 'Hours');
        INSERT INTO ViolationTypes (Code, Name, Recommendations, WhatToRecord) VALUES ('test', 'Test', 'Advice', 'Record');
        INSERT INTO Organizations (Name, City, ViolationTypeId, Website, Description) VALUES ('Legacy organization', 'Москва', 1, 'https://example.com', 'Test');
        """);
    await migrator.MigrateAsync();
    var point = await legacyDb.CollectionPoints.SingleAsync();
    var organization = await legacyDb.Organizations.SingleAsync();
    Expect(point.Region == "Москва" && point.District == "Арбат" && point.Settlement is null, "Collection point migration lost data");
    Expect(organization.Region == "Москва" && organization.Settlement is null, "Organization migration lost data");
});
foreach (var (item, code) in new[] { ("батарейки AA", "batteries"), ("Батарейки (AAA) 1,5V", "batteries"), ("Duracell батарейки АА", "batteries"), ("старые батарейки AA", "batteries"), ("телефон Samsung A52", "electronics"), ("стеклянная банка 500 мл", "glass"), ("Батарейки", "batteries") })
    await Check($"Item details preserve category: {item}", async () =>
    {
        var response = await recyclingService.SearchAsync(new() { Item = item, Region = "Москва" }, default);
        Expect(response.Category?.Code == code && response.Points.Count > 0 && response.PreparationInstructions.Count > 0, "Missing grounded category result");
    });
foreach (var item in new[] { "небатарейки AA", "коробка от батарейки", "батарейки и одежда", "батарейки AA paper", "glass batteries", "бумажные полотенца", "очки AA" })
    await Check($"Unknown or ambiguous item stays unknown: {item}", async () =>
    {
        var response = await recyclingService.SearchAsync(new() { Item = item, Region = "Москва" }, default);
        Expect(response.Category is null && response.Points.Count == 0 && response.PreparationInstructions.Count == 0, "Unsafe category guess");
    });
ViolationsController Controller() => new(violationService, stub, NullLogger<ViolationsController>.Instance)
{
    ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
};
foreach (var type in await violationService.GetTypesAsync(default))
    await Check($"Ready type {type.Code} bypasses LLM even with contradictory description", async () =>
    {
        stub.Error = new Exception("LLM must not run for an explicit type");
        var before = stub.Calls;
        var result = await Controller().ResolveType(new() { Type = type.Code, Description = "Куда сдать батарейки?" }, default);
        Expect(result.Result is OkObjectResult { Value: ViolationTypeDto chosen } && chosen.Code == type.Code, "Wrong ready type");
        Expect(stub.Calls == before, "Unexpected LLM call");
    });
await Check("Invalid explicit type does not fall back to LLM", async () =>
{
    var before = stub.Calls;
    var result = await Controller().ResolveType(new() { Type = "invented", Description = "Сжигают мусор" }, default);
    Expect(result.Result is ObjectResult { Value: ValidationProblemDetails details } && details.Errors.ContainsKey("type") && stub.Calls == before, "Invalid ready type used LLM");
});
await Check("Empty description and type do not call LLM", async () =>
{
    var before = stub.Calls;
    var result = await Controller().ResolveType(new() { Description = "  " }, default);
    Expect(result.Result is ObjectResult { Value: ValidationProblemDetails details } && details.Errors.ContainsKey("description") && stub.Calls == before, "Empty input used LLM");
});
stub.Error = null;
foreach (var type in await violationService.GetTypesAsync(default))
    await Check($"Description resolves supported SQLite type {type.Code}", async () =>
    {
        stub.Result = new() { Intent = "environmental_violation", ViolationType = type.Code };
        var before = stub.Calls;
        var result = await Controller().ResolveType(new() { Description = "Описание ситуации" }, default);
        Expect(result.Result is OkObjectResult { Value: ViolationTypeDto chosen } && chosen == type, "Resolved type was not from SQLite");
        Expect(stub.Calls == before + 1, "Missing or duplicate LLM call");
        var advice = await violationService.GetRecommendationsAsync(new() { Type = type.Code, Region = "Москва" }, default);
        Expect(advice?.Recommendations.Count > 0 && stub.Calls == before + 1, "Recommendations not served independently");
    });
foreach (var analysis in new[]
{
    new LlmIntentResult { Intent = "unknown" },
    new LlmIntentResult { Intent = "find_disposal", ViolationType = "waste_burning" },
    new LlmIntentResult { Intent = "environmental_violation", ViolationType = "invented_type" },
    new LlmIntentResult { Intent = "environmental_violation", ViolationType = null }
})
    await Check($"Unresolved description returns 422: {analysis.Intent}/{analysis.ViolationType}", async () =>
    {
        stub.Result = analysis;
        var result = await Controller().ResolveType(new() { Description = "Неопределённое описание" }, default);
        Expect(result.Result is ObjectResult { StatusCode: 422, Value: ProblemDetails }, "Unresolved input returned fabricated advice");
    });
await Check("Description provider failure is returned safely", async () =>
{
    stub.Error = new LlmServiceException("connection", 503, "Не удалось связаться с AI-сервисом.");
    var result = await Controller().ResolveType(new() { Description = "Сжигают мусор" }, default);
    Expect(result.Result is ObjectResult { StatusCode: 503, Value: ProblemDetails }, "Provider failure was hidden");
});
Console.WriteLine($"Passed {count} offline checks.");

sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request, cancellationToken);
}
sealed class StubLlm(LlmIntentResult result) : ILlmIntentService
{
    public LlmIntentResult Result { get; set; } = result;
    public int Calls { get; private set; }
    public Exception? Error { get; set; }
    public Task<LlmIntentResult> AnalyzeAsync(string message, IReadOnlyList<WasteCategoryDto> categories,
        IReadOnlyList<ViolationTypeDto> types, CancellationToken cancellationToken)
    {
        Calls++;
        if (Error is not null) throw Error;
        return Task.FromResult(Result);
    }
}
