using EcoHelper.Data;
using EcoHelper.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();

var connectionString = new SqliteConnectionStringBuilder(
    builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Не задана строка подключения DefaultConnection."));

// Resolve relative paths against the project, independently of the working directory.
if (connectionString.DataSource != ":memory:")
{
    connectionString.DataSource = Path.GetFullPath(
        connectionString.DataSource, builder.Environment.ContentRootPath);
    Directory.CreateDirectory(Path.GetDirectoryName(connectionString.DataSource)!);
}

builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString.ToString()));
builder.Services.AddScoped<RecyclingService>();
builder.Services.AddScoped<ViolationService>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();

await using (var scope = app.Services.CreateAsyncScope())
{
    await SeedData.InitializeAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>());
}

await app.RunAsync();
