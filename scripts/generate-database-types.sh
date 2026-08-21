#!/usr/bin/env bash
# Generate the public Supabase schema types from the target database.
#
# This command is intentionally explicit: generated types must come from the
# database that will receive the application, not from a guessed local schema.
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
  echo "Error: Supabase CLI not found. Install it before generating types." >&2
  exit 1
fi

TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

supabase gen types typescript --db-url "$DB_URL" --schema public > "$TMP_FILE"
if ! grep -q 'export type Database' "$TMP_FILE"; then
  echo "Error: Supabase CLI returned no Database type." >&2
  exit 1
fi

mv "$TMP_FILE" lib/database.types.ts
echo "Generated lib/database.types.ts from the target database."
