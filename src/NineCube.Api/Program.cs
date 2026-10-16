using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;
using NineCube.Api.Auth;
using NineCube.Api.Middleware;
using NineCube.Api.Serialization;
using NineCube.Application;
using NineCube.Application.Abstractions;
using NineCube.Application.Validation;
using NineCube.Infrastructure;
using NineCube.Infrastructure.Persistence;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------- logging
builder.Host.UseSerilog((context, _, configuration) => configuration
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext()
    .Enrich.WithProperty("Application", "NineCube.OrderProcessing")
    .WriteTo.Console(
        outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}"));

// ---------------------------------------------------------------- layers
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddValidatorsFromAssemblyContaining<RegisterRequestValidator>();

// ---------------------------------------------------------------- error contract
builder.Services.AddProblemDetails();
builder.Services.ConfigureAuthenticationProblemDetails();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Enums travel as readable strings ("Confirmed", "InventoryManager") so the API is
        // self-describing for the SPA and for anyone reading requests.http.
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        // Timestamps leave the API as explicit UTC instants, so the SPA can render them in the
        // viewer's own time zone instead of silently re-labelling UTC as local time.
        options.JsonSerializerOptions.Converters.Add(new UtcDateTimeJsonConverter());
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

// Model binding failures (malformed JSON, wrong types) use the same ProblemDetails shape.
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var problem = new ValidationProblemDetails(context.ModelState)
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "The request is invalid.",
            Type = ProblemDetailsFactoryExtensions.ProblemBaseUri + "invalid_request",
            Instance = context.HttpContext.Request.Path
        };

        problem.Extensions["code"] = "invalid_request";
        problem.Extensions["correlationId"] = CorrelationIdMiddleware.Get(context.HttpContext);

        return new ObjectResult(problem)
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" }
        };
    };
});

// ---------------------------------------------------------------- cross cutting
builder.Services.AddAuthorization(options => options.AddNineCubePolicies());

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options => options.AddPolicy("spa", policy => policy
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>("sqlserver");

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "NineCube.Digital - Order Processing API",
        Version = "v1",
        Description =
            "Order processing for a small retail business. Stock is reserved atomically at order " +
            "placement; roles enforce separation of duties between order handling and stock control."
    });

    var scheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste the accessToken returned by POST /api/auth/login (without the 'Bearer ' prefix).",
    };

    options.AddSecurityDefinition("Bearer", scheme);
    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("Bearer", document)] = []
    });
});

var app = builder.Build();

// ---------------------------------------------------------------- database bootstrap
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasherService>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    await DatabaseSeeder.MigrateAndSeedAsync(
        db, app.Configuration, app.Environment.IsDevelopment(), hasher, logger);
}

// ---------------------------------------------------------------- pipeline
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseSerilogRequestLogging();
app.UseCors("spa");

// Uploaded product media is served straight from the storage folder, outside the build output, so the
// files a merchant uploaded survive a restart or a redeploy. <img> requests cannot carry a bearer token,
// and the urls are unguessable GUID names, so this stays anonymous read-only.
var uploads = app.Services.GetRequiredService<IProductStorage>();
Directory.CreateDirectory(uploads.RootPath);
app.UseStaticFiles();
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploads.RootPath),
    RequestPath = uploads.PublicPrefix
});

app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/swagger/v1/swagger.json", "NineCube Order Processing API v1"));
}

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(e => new { name = e.Key, status = e.Value.Status.ToString() })
        });
    }
}).AllowAnonymous();

app.MapControllers();

app.Run();

/// <summary>Exposed so the integration test project can reference the entry point.</summary>
public partial class Program { }
