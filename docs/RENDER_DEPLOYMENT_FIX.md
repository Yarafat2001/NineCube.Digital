# Render deployment failure — 16 October 2026

The provided log shows HTTP listening on port 8080 while every `/health` request returns 503 because the PostgreSQL check is unhealthy. It contains no original database exception, so database reachability, credentials, and migration execution cannot be verified from that excerpt.

The repository had two concrete configuration defects: the Blueprint supplies a PostgreSQL URI directly to Npgsql, which expects keyword connection parameters; and the empty default in appsettings.json prevents the null-coalescing DATABASE_URL fallback from executing. The shared connection normalizer now supports both formats, percent-encoded credentials, custom ports and TLS parameters, and rejects malformed configuration without exposing its contents. Startup and EF tooling use the same normalizer.

Startup now aborts on migration/seeding failure rather than swallowing the exception and serving a permanently unhealthy API. `/health` remains database-backed. Runtime PORT is handled by Program.cs rather than Docker build-time expansion. Database and API explicitly share the Oregon region. Docker context excludes local environment files, dependencies, seed tooling and media tools.

## Apply on Render

1. Push these changes to the repository/branch connected to Render and deploy its latest commit. Existing dashboard services must use that branch; local file edits do not deploy automatically.
2. For a Blueprint, sync render.yaml. For a manually created web service, set `ConnectionStrings__Default` to the existing database's **Internal Database URL** (or supply DATABASE_URL with the Default setting blank). Keep API and database in the same region. Render does not automatically inject DATABASE_URL into every manually created service.
3. Keep `Jwt__SigningKey` configured with at least 32 bytes, environment Production, Dockerfile `src/NineCube.Api/Dockerfile`, context repository root, and health path `/health`.
4. Verify migrations complete and `/health` responds 200 with postgres Healthy. Then test `/api/categories` and `/api/products` from the frontend. If startup fails, inspect the first migration/database exception rather than the repeated health-check lines. Do not share passwords or full connection URLs in logs/screenshots.

Production deliberately skips Development-only demo account seeding. The existing NINECUBE_SEED_PASSWORD Blueprint entry does not create production demo users. Existing SQL Server local data is not migrated into the new PostgreSQL database by these changes.

Regression check: `dotnet run --project tools/deployment-checks/DeploymentChecks.csproj`. This validates URL conversion without connecting to or modifying any database. A successful live Render deployment still requires dashboard access and verification against its actual database.

## Additional verification

The full production Docker image built successfully and ran against a disposable PostgreSQL 17 database using a Render-style URI and PORT=10000. Initial migration and seed completed, `/health` returned HTTP 200 with postgres Healthy, `/api/categories` returned 200, and the protected products endpoint returned 401 without credentials. The API CI workflow now builds from the repository root using the correct Dockerfile and runs all seven connection configuration checks. Previously its Docker context was `src/NineCube.Api`, which cannot satisfy the Dockerfile's repository-relative COPY instructions.
