#!/usr/bin/env bash
# Opens an SSH tunnel to the self-hosted Postgres (supabase-db is only
# reachable from inside the Coolify Docker network), runs `supabase db
# push`, and closes the tunnel afterward — even if the push fails or the
# script gets interrupted.
#
# Interactive by default: confirms the target (SSH host + database, password
# masked) before connecting, then confirms again showing the pending
# migrations (via dry-run) before applying for real. Pass --yes to skip both
# confirmations (e.g. running from a larger script that already validated
# everything).
#
# Requires .env.tunnel.local at the repo root with DB_URL set (see
# .gitignore — that file is never committed). SSH_HOST, TUNNEL_REMOTE and
# LOCAL_PORT have defaults but can be overridden in the same file.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
  esac
done

ENV_FILE=".env.tunnel.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found." >&2
  echo 'Create it with: DB_URL="postgres://postgres:PASSWORD@localhost:5432/postgres?sslmode=disable"' >&2
  exit 1
fi
set -a
source "$ENV_FILE"
set +a

: "${DB_URL:?DB_URL not set in $ENV_FILE}"
SSH_HOST="${SSH_HOST:-hostinger}"
TUNNEL_REMOTE="${TUNNEL_REMOTE:-10.0.1.4:5432}"
LOCAL_PORT="${LOCAL_PORT:-5432}"

# Mask the password for display only — never log the full DB_URL.
DB_URL_MASKED=$(printf '%s' "$DB_URL" | sed -E 's#(://[^:/]+:)[^@]+(@)#\1***\2#')

confirm() {
  local prompt="$1"
  if [ "$ASSUME_YES" = true ]; then
    return 0
  fi
  read -r -p "$prompt [y/N] " reply
  case "$reply" in
    [yY]|[yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

echo "=== Target ==="
echo "SSH host:  $SSH_HOST"
echo "Tunnel:    localhost:${LOCAL_PORT} -> ${TUNNEL_REMOTE}"
echo "Database:  $DB_URL_MASKED"
echo

if ! confirm "Confirm this is the right server/database to connect to?"; then
  echo "Cancelled."
  exit 1
fi

echo
echo "Opening SSH tunnel..."
ssh -o ExitOnForwardFailure=yes -o ConnectTimeout=10 \
  -L "${LOCAL_PORT}:${TUNNEL_REMOTE}" -N "$SSH_HOST" &
TUNNEL_PID=$!

cleanup() {
  echo "Closing SSH tunnel (pid $TUNNEL_PID)..."
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for the tunnel to come up..."
ready=false
for _ in $(seq 1 30); do
  if (exec 3<>"/dev/tcp/127.0.0.1/${LOCAL_PORT}") 2>/dev/null; then
    exec 3>&- 3<&-
    ready=true
    break
  fi
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Error: SSH tunnel process died before connecting." >&2
    exit 1
  fi
  sleep 1
done

if [ "$ready" != true ]; then
  echo "Error: tunnel didn't respond on port ${LOCAL_PORT} after 30s." >&2
  exit 1
fi
echo "Tunnel ready."
echo

echo "=== Checking pending migrations (dry-run) ==="
DRY_RUN_OUTPUT=$(supabase db push --db-url "$DB_URL" --dry-run 2>&1) || {
  echo "$DRY_RUN_OUTPUT"
  echo "Error checking pending migrations." >&2
  exit 1
}
echo "$DRY_RUN_OUTPUT"
echo

if echo "$DRY_RUN_OUTPUT" | grep -qi "up to date"; then
  exit 0
fi

if ! confirm "Apply the migrations listed above to production?"; then
  echo "Cancelled — nothing was changed on the database."
  exit 1
fi

echo
echo "Running supabase db push..."
supabase db push --db-url "$DB_URL"
