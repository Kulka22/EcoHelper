using EcoHelper.Models;
using Microsoft.EntityFrameworkCore;

namespace EcoHelper.Data;

public static class SeedData
{
    public static async Task InitializeAsync(AppDbContext db, CancellationToken cancellationToken = default)
    {
        await db.Database.MigrateAsync(cancellationToken);

        // All demo rows are committed together; subsequent starts preserve existing data.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        if (await db.WasteCategories.AnyAsync(cancellationToken))
        {
            await transaction.CommitAsync(cancellationToken);
            return;
        }

        var glass = Category("glass", "Стекло",
            ["Стеклянная банка", "Стеклянные банки", "Банка", "Стеклянная бутылка", "Стеклянные бутылки", "Стеклотара"],
            ["Освободите стеклянную тару от содержимого и ополосните её.",
             "Отделите крышки и детали из других материалов.",
             "Уточните условия приёма стеклотары в выбранном пункте."]);
        var batteries = Category("batteries", "Батарейки",
            ["Батарейка", "Использованные батарейки", "Отработанные батарейки"],
            ["Храните отработанные батарейки отдельно от обычного мусора.",
             "Не разбирайте батарейки; повреждённые элементы требуют отдельных условий приёма.",
             "Уточните у пункта, какие элементы питания он принимает."]);
        var clothes = Category("clothes", "Одежда",
            ["Вещи", "Старая одежда", "Ненужная одежда", "Текстиль"],
            ["Постирайте и полностью высушите одежду.",
             "Отделите вещи для повторного использования от изношенного текстиля.",
             "Сложите вещи в пакет и уточните требования пункта."]);
        var caps = Category("plastic_caps", "Пластиковые крышки",
            ["Крышечки", "Пластиковые крышечки", "Крышки от бутылок"],
            ["Очистите крышки от остатков содержимого и высушите их.",
             "Проверьте маркировку пластика и список принимаемых крышек.",
             "Соберите крышки отдельно от других видов вторсырья."]);
        var paper = Category("paper", "Бумага",
            ["Макулатура", "Картон", "Газеты", "Бумажные коробки"],
            ["Собирайте чистую и сухую бумагу отдельно от пищевых отходов.",
             "Удалите плёнку и другие небумажные вложения.",
             "Сложите коробки и уточните список принимаемой макулатуры."]);
        var electronics = Category("electronics", "Электроника",
            ["Телефон", "Старый телефон", "Смартфон", "Старая техника", "Ноутбук"],
            ["Сохраните нужную информацию и удалите личные данные с устройства.",
             "Уточните, можно ли передать устройство для повторного использования.",
             "Перед сдачей уточните правила приёма устройства и его аккумулятора."]);

        db.WasteCategories.AddRange(glass, batteries, clothes, caps, paper, electronics);
        // These are explicitly educational fixtures, not addresses of real collection services.
        db.CollectionPoints.AddRange(
            Point("Учебный пункт «Раздельный сбор»", "Дорогомилово", 1, "Демо: ежедневно 10:00–19:00", glass, paper, caps),
            Point("Учебный пункт «Батарейки и техника»", "Арбат", 2, "Демо: пн–сб 11:00–20:00", batteries, electronics),
            Point("Учебный пункт «Вторая жизнь вещей»", "Дорогомилово", 3, "Демо: вт–вс 12:00–18:00", clothes, electronics));

        var violations = new[]
        {
            Violation("illegal_dumping", "Незаконная свалка",
                ["Не трогайте отходы неизвестного происхождения.",
                 "Опишите место скопления мусора и направьте сведения в профильную организацию.",
                 "Порядок обращения и компетенцию организации уточните на её официальном сайте."],
                ["Адрес или понятный ориентир и дату наблюдения.", "Примерные размеры и характер отходов.",
                 "Фото с безопасного расстояния, если его можно сделать без риска."]),
            Violation("waste_burning", "Сжигание мусора",
                ["Держитесь на безопасном расстоянии от огня и дыма.",
                 "При непосредственной угрозе жизни или пожаре обратитесь в экстренные службы.",
                 "Сообщите профильной организации о повторяющемся сжигании отходов."],
                ["Место и время появления дыма или огня.", "Как часто ситуация повторяется.",
                 "Наблюдаемые обстоятельства; не приближайтесь к источнику для сбора доказательств."]),
            Violation("water_pollution", "Загрязнение водоёма",
                ["Избегайте контакта с загрязнённой водой и неизвестными веществами.",
                 "Опишите наблюдаемые признаки загрязнения без самостоятельного отбора проб.",
                 "Передайте сведения профильной организации и уточните порядок обращения."],
                ["Название водоёма, берег или ближайший ориентир.", "Дата и время наблюдения.",
                 "Видимые изменения воды, мусор или место возможного сброса с безопасного расстояния."]),
            Violation("illegal_logging", "Незаконная вырубка деревьев",
                ["Не заходите в зону работ и не вступайте в конфликт с участниками.",
                 "Уточните сведения о работах у ответственной организации или на официальном сайте.",
                 "При подозрении на нарушение передайте наблюдения профильной организации."],
                ["Адрес или ориентир, дату и время работ.", "Примерное количество затронутых деревьев.",
                 "Доступную информацию о работах и фото с безопасного расстояния."])
        };

        foreach (var violation in violations)
        {
            violation.Organizations.Add(new Organization
            {
                Name = "Департамент природопользования и охраны окружающей среды города Москвы",
                City = "Москва",
                Website = "https://www.mos.ru/eco/",
                Description = "Информация о природоохранных вопросах Москвы. Перед обращением уточните компетенцию и актуальный порядок приёма на официальном сайте."
            });
            violation.Organizations.Add(new Organization
            {
                Name = "Росприроднадзор",
                Website = "https://rpn.gov.ru/petition/",
                Description = "Общий справочный ресурс об обращениях. Уточните компетенцию ведомства и нужный территориальный орган; Экопомощник не отправляет обращение."
            });
        }

        db.ViolationTypes.AddRange(violations);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private static WasteCategory Category(string code, string name, string[] aliases, string[] instructions) => new()
    {
        Code = code,
        Name = name,
        PreparationInstructions = string.Join('\n', instructions),
        Aliases = aliases.Prepend(name).Append(code).Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(alias => new WasteCategoryAlias { Name = alias }).ToList()
    };

    private static CollectionPoint Point(string name, string district, int number, string hours, params WasteCategory[] categories) => new()
    {
        Name = name,
        City = "Москва",
        District = district,
        Address = $"Демонстрационный адрес №{number}, район {district}",
        WorkingHours = hours,
        CollectionPointWasteCategories = categories.Select(category =>
            new CollectionPointWasteCategory { WasteCategory = category }).ToList()
    };

    private static ViolationType Violation(string code, string name, string[] recommendations, string[] whatToRecord) => new()
    {
        Code = code,
        Name = name,
        Recommendations = string.Join('\n', recommendations),
        WhatToRecord = string.Join('\n', whatToRecord)
    };
}
