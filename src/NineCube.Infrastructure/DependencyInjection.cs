using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using NineCube.Application.Abstractions;
using NineCube.Domain;
using NineCube.Infrastructure.Caching;
using NineCube.Infrastructure.Identity;
using NineCube.Infrastructure.Persistence;
using NineCube.Infrastructure.Storage;

namespace NineCube.Infrastructure;

public sealed record CachedUserInfo(int Id, string Email, UserRole Role, int? CustomerId, bool IsActive);

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var connectionString = PostgresConnectionConfiguration.Resolve(configuration);

        // NOTE: no EnableRetryOnFailure here on purpose. The PostgreSQL execution strategy is
        // incompatible with the user-initiated transactions that PlaceOrder relies on. Retries are
        // handled by ITransientErrorPolicy, which understands which errors are actually retryable.
        services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddMemoryCache();
        services.AddSingleton<ICacheService, MemoryCacheService>();

        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IPasswordHasherService, PasswordHasherService>();
        services.AddSingleton<ITransientErrorPolicy, PostgresTransientErrorPolicy>();
        services.AddSingleton<IProductStorage>(new ProductFileStorage(
            configuration["Products:UploadPath"] ?? Path.Combine(environment.ContentRootPath, "uploads"),
            configuration["Products:PublicPrefix"] ?? "/uploads"));
        services.AddScoped<IJwtTokenService, JwtTokenService>();

        services.AddHttpContextAccessor();

        return services;
    }

    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(JwtOptions.SectionName);
        services.Configure<JwtOptions>(section);

        var options = section.Get<JwtOptions>() ?? new JwtOptions();

        if (string.IsNullOrWhiteSpace(options.SigningKey) || Encoding.UTF8.GetByteCount(options.SigningKey) < 32)
        {
            NewMethod();
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(bearer =>
            {
                bearer.MapInboundClaims = false;
                bearer.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = options.Issuer,
                    ValidateAudience = true,
                    ValidAudience = options.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "email",
                    RoleClaimType = "role"
                };

                bearer.Events = new JwtBearerEvents
                {
                    // Two things happen on every authenticated request:
                    // 1. a deactivated account is rejected immediately (not just at login), and
                    // 2. the role is re-read from the database, so a role change by an administrator
                    //    takes effect on existing tokens instead of waiting for the token to expire.
                    OnTokenValidated = async context =>
                    {
                        var userIdClaim = context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub);
                        if (!int.TryParse(userIdClaim, out var userId))
                        {
                            context.Fail("The access token does not identify a user.");
                            return;
                        }

                        var cache = context.HttpContext.RequestServices.GetRequiredService<ICacheService>();
                        var db = context.HttpContext.RequestServices.GetRequiredService<IAppDbContext>();

                        var user = await cache.GetOrCreateAsync(
                            $"auth:user:{userId}",
                            async ct =>
                            {
                                return await db.Users.AsNoTracking()
                                    .Where(u => u.Id == userId)
                                    .Select(u => new CachedUserInfo(u.Id, u.Email, u.Role, u.CustomerId, u.IsActive))
                                    .FirstOrDefaultAsync(ct);
                            },
                            TimeSpan.FromSeconds(30),
                            context.HttpContext.RequestAborted);

                        if (user is null)
                        {
                            context.Fail("The account no longer exists.");
                            return;
                        }

                        if (!user.IsActive)
                        {
                            context.Fail("This account has been deactivated.");
                            return;
                        }

                        var claims = new List<Claim>
                        {
                            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                            new(JwtRegisteredClaimNames.Email, user.Email),
                            new("role", user.Role.ToString())
                        };

                        if (user.CustomerId is not null)
                            claims.Add(new Claim(JwtTokenService.CustomerIdClaim, user.CustomerId.Value.ToString()));

                        context.Principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer", "email", "role"));
                    }
                };
            });

        return services;

        static void NewMethod()
        {
            throw new InvalidOperationException(
                "Jwt:SigningKey must be configured with at least 32 bytes (HS256). " +
                "Set it via appsettings.Development.json, user secrets or the Jwt__SigningKey environment variable.");
        }
    }
}
