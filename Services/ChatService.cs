using EcoHelper.DTO;

namespace EcoHelper.Services;

public sealed class ChatService(ILlmIntentService llm, RecyclingService recycling, ViolationService violations)
{
    public const string UnknownMessage = "Я могу помочь только с вопросами об экологии и возможностях Экопомощника.";
    private static ChatActionDto RecyclingAction(ChatScenarioParameters? parameters = null) => new("Куда сдать", "/recycling.html", parameters);
    private static ChatActionDto ViolationAction(ChatScenarioParameters? parameters = null) => new("Сообщить о нарушении", "/violations.html", parameters);

    public async Task<ChatResponse> ReplyAsync(string message, CancellationToken cancellationToken)
    {
        // The model sees only catalog labels/codes, never factual recommendations or organizations.
        var categories = await recycling.GetCategoriesAsync(cancellationToken);
        var types = await violations.GetTypesAsync(cancellationToken);
        var analysis = await llm.AnalyzeAsync(message, categories, types, cancellationToken);
        switch (analysis.Intent)
        {
            case "find_disposal":
                var parameters = new ChatScenarioParameters(analysis.Item, analysis.City, analysis.District);
                if (analysis.Item is null || analysis.City is null)
                    return new(analysis.Intent, analysis.Item is null
                        ? "Укажите предмет и город в разделе «Куда сдать», чтобы найти пункты в базе."
                        : "Укажите город в разделе «Куда сдать», чтобы найти пункты в базе.", [RecyclingAction(parameters)]);
                var found = await recycling.SearchAsync(new() { Item = analysis.Item, City = analysis.City, District = analysis.District }, cancellationToken);
                return new(analysis.Intent, found.Category is null
                    ? found.Message!
                    : found.Points.Count == 0 ? found.Message!
                    : $"В демонстрационной базе найдены пункты: {found.Points.Count}. Категория: {found.Category.Name}.",
                    [RecyclingAction(parameters)], Recycling: found);

            case "environmental_violation":
                var violationParameters = new ChatScenarioParameters(ViolationType: analysis.ViolationType, Location: analysis.Location);
                if (analysis.ViolationType is null)
                    return new(analysis.Intent, "Выберите подходящий тип нарушения в разделе «Сообщить о нарушении», чтобы получить рекомендации из базы.", [ViolationAction(violationParameters)]);
                var advice = await violations.GetRecommendationsAsync(new() { Type = analysis.ViolationType, Location = analysis.Location }, cancellationToken);
                if (advice is null)
                    return new(analysis.Intent, "Тип нарушения не найден в базе. Выберите тип в разделе «Сообщить о нарушении».", [ViolationAction()]);
                return new(analysis.Intent, $"Ситуация: {advice.Type.Name}. Рекомендации получены из базы Экопомощника.",
                    [ViolationAction(violationParameters)], Violation: advice);

            case "navigation":
                var action = analysis.Section switch
                {
                    "home" => new ChatActionDto("Главная", "/"),
                    "recycling" => RecyclingAction(new(analysis.Item, analysis.City, analysis.District)),
                    "violations" => ViolationAction(new(ViolationType: analysis.ViolationType, Location: analysis.Location)),
                    "assistant" => new ChatActionDto("AI-помощник", "/assistant.html"),
                    _ => null
                };
                return action is null
                    ? new(analysis.Intent, "Выберите раздел Экопомощника.", [new("Главная", "/"), RecyclingAction(), ViolationAction(), new("AI-помощник", "/assistant.html")])
                    : new(analysis.Intent, $"Нужный раздел: «{action.Label}».", [action]);

            case "ecology_help":
                return new(analysis.Intent, "Экопомощник помогает найти пункты сдачи вещей и рекомендации при экологических нарушениях. Укажите предмет и город или опишите нарушение. Фактические сведения доступны в базе сервиса.", [RecyclingAction(), ViolationAction()]);
            default:
                return new("unknown", UnknownMessage, []);
        }
    }
}
