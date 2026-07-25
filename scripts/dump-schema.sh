#!/usr/bin/env bash
# Dumps the EXACT production database schema (no data) to schema/production_schema.sql.
# See scripts/dump-schema.ps1 for full documentation (Windows version).
#
# Usage:
#   cp scripts/schema.env.example scripts/.env.schema   # fill in SUPABASE_DB_URL
#   bash scripts/dump-schema.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/.env.schema"
OUT_FILE="$REPO_ROOT/schema/production_schema.sql"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy scripts/schema.env.example)"; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
[ -n "${SUPABASE_DB_URL:-}" ] || { echo "SUPABASE_DB_URL is empty in $ENV_FILE"; exit 1; }

mkdir -p "$REPO_ROOT/schema"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --dbname="$SUPABASE_DB_URL" --schema=public --schema-only \
    --no-owner --no-privileges --file="$OUT_FILE"
else
  echo "pg_dump not found; falling back to Supabase CLI (requires Docker)..."
  npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" --schema public -f "$OUT_FILE"
fi

echo "Schema written to $OUT_FILE"
