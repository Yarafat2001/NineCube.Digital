# ---------------------------------------------------------------- Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy solution-level files first for better layer caching
COPY ["src/NineCube.Api/NineCube.Api.csproj", "src/NineCube.Api/"]
COPY ["src/NineCube.Infrastructure/NineCube.Infrastructure.csproj", "src/NineCube.Infrastructure/"]
COPY ["src/NineCube.Application/NineCube.Application.csproj", "src/NineCube.Application/"]
COPY ["src/NineCube.Domain/NineCube.Domain.csproj", "src/NineCube.Domain/"]
RUN dotnet restore "src/NineCube.Api/NineCube.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/src/NineCube.Api"
RUN dotnet publish "NineCube.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ---------------------------------------------------------------- Stage 2: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Program.cs honors Render's runtime PORT; 8080 is the local container default.
ENV ASPNETCORE_HTTP_PORTS=8080
ENV ASPNETCORE_ENVIRONMENT=Production

# Non-root user for security
RUN useradd -m -s /bin/bash appuser && chown -R appuser /app
USER appuser

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "NineCube.Api.dll"]
