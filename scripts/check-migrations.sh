#!/usr/bin/env bash
# Read-only migration drift check.
#
# DB_URL can be exported by the caller or loaded from .env.tunnel.local. The
# connection string is never printed. This script intentionally does not run
# `supabase db push` without --dry-run.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ENV_FILE=".env.tunnel.local"
if [ -z "${DB_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
fi

: "${DB_URL:?DB_URL must be exported or defined in .env.tunnel.local}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Error: Supabase CLI not found. Install it before running this check." >&2
  exit 1
fi

echo "=== Applied migration list (read-only) ==="
supabase migration list --db-url "$DB_URL"
echo
echo "=== Pending migration check (dry-run) ==="
supabase db push --db-url "$DB_URL" --dry-run
echo
echo "Migration drift check completed. No database changes were made."
