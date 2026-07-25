# ============================================================
# dump-schema.ps1
# Dumps the EXACT production database schema (no data) to
# schema/production_schema.sql.
#
# Usage:
#   1. Copy scripts/schema.env.example -> scripts/.env.schema and fill in SUPABASE_DB_URL
#   2. powershell -ExecutionPolicy Bypass -File scripts/dump-schema.ps1
#
# Requires ONE of:
#   - pg_dump on PATH (comes with any PostgreSQL install), or
#   - the Supabase CLI (`scoop install supabase` / winget / npx) with Docker running.
#
# Notes:
#   - Dumps the `public` schema only: tables, constraints, indexes, RLS policies,
#     functions, triggers. Supabase-managed schemas (auth/storage/realtime) are
#     platform infrastructure and are intentionally excluded.
#   - The auth.users trigger that calls public.handle_new_user() lives in the
#     auth schema and will NOT appear in this dump; it is documented in
#     migrations/ instead.
# ============================================================

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $PSScriptRoot ".env.schema"
$outDir = Join-Path $repoRoot "schema"
$outFile = Join-Path $outDir "production_schema.sql"

# --- Load .env.schema ---
if (-not (Test-Path $envFile)) {
    Write-Error "Missing $envFile. Copy scripts/schema.env.example to scripts/.env.schema and fill in SUPABASE_DB_URL."
}

$dbUrl = $null
foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if ($trimmed -match "^SUPABASE_DB_URL=(.+)$") {
        $dbUrl = $Matches[1].Trim()
    }
}
if ([string]::IsNullOrWhiteSpace($dbUrl)) {
    Write-Error "SUPABASE_DB_URL is empty in $envFile."
}

New-Item -ItemType Directory -Force $outDir | Out-Null

# --- Prefer pg_dump (fast, no Docker) ---
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($null -ne $pgDump) {
    Write-Host "Using pg_dump at $($pgDump.Source)"
    & pg_dump `
        --dbname=$dbUrl `
        --schema=public `
        --schema-only `
        --no-owner `
        --no-privileges `
        --file=$outFile
    if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump failed with exit code $LASTEXITCODE" }
}
else {
    Write-Host "pg_dump not found; falling back to Supabase CLI (requires Docker running)..."
    npx --yes supabase db dump --db-url $dbUrl --schema public -f $outFile
    if ($LASTEXITCODE -ne 0) { Write-Error "supabase db dump failed with exit code $LASTEXITCODE" }
}

Write-Host ""
Write-Host "Schema written to $outFile"
Write-Host "Tip: also run 'yarn db:pull' to refresh prisma/schema.prisma from the same database."
