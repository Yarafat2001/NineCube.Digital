#!/usr/bin/env bash
# Starts the API against a local SQL Server (LocalDB by default) on http://127.0.0.1:5080.
# Override any value by exporting it before calling this script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DOTNET="${DOTNET:-dotnet}"

export ASPNETCORE_ENVIRONMENT="${ASPNETCORE_ENVIRONMENT:-Development}"
export ASPNETCORE_URLS="${ASPNETCORE_URLS:-http://127.0.0.1:5080}"
export ConnectionStrings__Default="${ConnectionStrings__Default:-Server=(localdb)\MSSQLLocalDB;Database=NineCubeOrderProcessing;Integrated Security=true;TrustServerCertificate=True;Connect Timeout=60}"
export Jwt__SigningKey="${Jwt__SigningKey:-ninecube-orderprocessing-dev-signing-key-2026-do-not-use-in-production}"
: "${NINECUBE_SEED_PASSWORD:?NINECUBE_SEED_PASSWORD is env-only; export it (or run \". ../.env\") before this script}"
export NINECUBE_SEED_PASSWORD
export Cors__AllowedOrigins__0='http://127.0.0.1:5173'
export Cors__AllowedOrigins__1='http://localhost:5173'

cd "$ROOT/src/NineCube.Api"
exec "$DOTNET" bin/Debug/net10.0/NineCube.Api.dll
