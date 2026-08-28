#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

copy_if_missing() {
  local src="$1"
  local dest="$2"

  if [ -e "$dest" ]; then
    echo "Skipping $dest (already exists)."
    return 0
  fi

  cp "$src" "$dest"
  echo "Created $dest from $src."
}

copy_if_missing ".env.selfhosted.example" ".env.tunnel.local"
copy_if_missing "supabase-migration.env.example" "supabase-migration.env"

cat <<'EOF'

Self-hosted bootstrap complete.

Files created:
  - .env.tunnel.local
  - supabase-migration.env

Next steps:
  1. Fill .env.local using .env.selfhosted.example as reference.
  2. Fill .env.tunnel.local with the SSH host and self-hosted Postgres password.
  3. Fill supabase-migration.env if you need Cloud -> self-hosted migration.
  4. Run `bash scripts/db-push-tunnel.sh --check-only` to verify database access.
  5. Run `bash scripts/db-push-tunnel.sh` to apply pending migrations.
  6. Run `bash scripts/db-push-tunnel.sh --types-only` to refresh lib/database.types.ts.

See docs/SELF_HOSTED_SETUP.md for the full procedure and validation checklist.
EOF
