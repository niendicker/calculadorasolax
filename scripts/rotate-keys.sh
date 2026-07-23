#!/usr/bin/env bash
# Propagates a rotated Supabase key to every place this app reads it from.
#
# This script does NOT generate the new key value — that's a deliberately
# manual step (Supabase dashboard → Settings → API → "Roll" the key you want
# to rotate). Once you have the new value, this script pushes it to:
#
#   service-role  → Vercel env var SUPABASE_SERVICE_ROLE_KEY (server-only,
#                    used by app/api/account/delete/route.ts) AND the
#                    Supabase Edge Function secret of the same name (used by
#                    supabase/functions/calculate-residential) — both places
#                    that read this key.
#   anon          → Vercel env var NEXT_PUBLIC_SUPABASE_ANON_KEY (client +
#                    server Supabase clients). Not needed by the Edge
#                    Function.
#   url           → Vercel env var NEXT_PUBLIC_SUPABASE_URL. Rarely rotates
#                    (only if the project itself moves), included for
#                    completeness.
#
# Requires the `vercel` and `supabase` CLIs already installed and logged in
# (`vercel login`, `supabase login`) — no tokens are read or stored here.
#
# Usage:
#   scripts/rotate-keys.sh service-role <new-value> [--environments "production preview"] [--redeploy]
#   scripts/rotate-keys.sh anon <new-value> [--environments "production preview"] [--redeploy]
#   scripts/rotate-keys.sh url <new-value> [--environments "production preview"] [--redeploy]
#
# By default nothing is redeployed — Vercel env var changes only take effect
# on the *next* deployment, so the script prints a reminder unless you pass
# --redeploy, which runs `vercel deploy --prod` for you (a production deploy
# is a real, visible action, so it's opt-in, not automatic).

set -euo pipefail

usage() {
  grep '^#' "$0" | sed -e 's/^#!.*//' -e 's/^# \{0,1\}//'
  exit 1
}

KEY_NAME=""
NEW_VALUE=""
ENVIRONMENTS="production preview"
REDEPLOY=0

case "${1:-}" in
  service-role) KEY_NAME="SUPABASE_SERVICE_ROLE_KEY" ;;
  anon)         KEY_NAME="NEXT_PUBLIC_SUPABASE_ANON_KEY" ;;
  url)          KEY_NAME="NEXT_PUBLIC_SUPABASE_URL" ;;
  -h|--help|"") usage ;;
  *) echo "Unknown key '$1' — expected service-role, anon, or url." >&2; exit 1 ;;
esac
NEW_VALUE="${2:-}"
if [ -z "$NEW_VALUE" ]; then
  echo "Missing <new-value> for '$1'." >&2
  usage
fi
shift 2

while [ $# -gt 0 ]; do
  case "$1" in
    --environments) ENVIRONMENTS="$2"; shift 2 ;;
    --redeploy) REDEPLOY=1; shift ;;
    *) echo "Unknown flag '$1'." >&2; exit 1 ;;
  esac
done

command -v vercel >/dev/null 2>&1 || { echo "vercel CLI not found — npm i -g vercel, then 'vercel login'." >&2; exit 1; }

echo "==> Updating Vercel env var $KEY_NAME for: $ENVIRONMENTS"
for env in $ENVIRONMENTS; do
  vercel env rm "$KEY_NAME" "$env" --yes >/dev/null 2>&1 || true
  printf '%s' "$NEW_VALUE" | vercel env add "$KEY_NAME" "$env"
done

if [ "$KEY_NAME" = "SUPABASE_SERVICE_ROLE_KEY" ]; then
  command -v supabase >/dev/null 2>&1 || { echo "supabase CLI not found — npm i -g supabase, then 'supabase login'." >&2; exit 1; }
  echo "==> Updating Supabase Edge Function secret $KEY_NAME"
  echo "    (applies immediately to calculate-residential, no redeploy needed)"
  supabase secrets set "$KEY_NAME=$NEW_VALUE"
fi

if [ "$REDEPLOY" = "1" ]; then
  echo "==> Redeploying to production so the new Vercel env var takes effect"
  vercel deploy --prod
else
  echo
  echo "Vercel env var(s) updated, but they only apply to NEW deployments."
  echo "Redeploy when ready — e.g. 'vercel deploy --prod' or 'git push' — or re-run with --redeploy."
fi

echo "==> Done. Remember to also revoke/roll the OLD key value in the Supabase dashboard if you haven't already."
