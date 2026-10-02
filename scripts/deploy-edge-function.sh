#!/usr/bin/env bash
# Deploys Supabase Edge Functions to the self-hosted stack, from this
# machine over the same SSH connection db-push-tunnel.sh uses (no separate
# VPN-only port needed here — just a plain SSH session to run docker/tar
# commands, unlike the Postgres tunnel).
#
# `npx supabase functions deploy --project-ref` only talks to the Supabase
# Cloud management API — it does not work against a self-hosted stack, even
# with `supabase link` pointed at the right project. Self-hosted deploys
# instead mean: copy the function's files into the volume the
# `supabase-edge-functions-*` container mounts at /home/deno/functions, then
# restart that container. That is exactly what this script automates — the
# same mechanism scripts/migrate-supabase-cloud-to-selfhosted-v5.sh uses
# internally (find_edge_container/migrate_functions), but sourced straight
# from this repo instead of downloaded from Supabase Cloud. See
# docs/SELF_HOSTED_SETUP.md.
#
# Transfer uses plain `tar` piped over `ssh` — not rsync/scp — since rsync
# isn't guaranteed to be installed on the remote host (it wasn't, here).
# `tar` and `ssh` are assumed to exist everywhere this runs.
#
# Usage:
#   scripts/deploy-edge-function.sh                       # detect and deploy what's pending
#   scripts/deploy-edge-function.sh --check                # only report status, deploy nothing
#   scripts/deploy-edge-function.sh <function-name>         # deploy one specific function
#   scripts/deploy-edge-function.sh --all                   # deploy every pending function
#   ... any of the above plus [--yes] [--dry-run]
#
# With no function name, the script compares every local
# supabase/functions/<name>/ (a sha256 manifest of its files, computed
# locally and remotely) against the remote volume: never-deployed and
# out-of-date functions count as pending. supabase/functions/_shared/ is
# compared the same way — if it differs, every function is treated as
# pending too, since they all resolve `../_shared/...` imports against that
# same shared volume path. With exactly one pending function, it deploys
# that one directly; with more than one, it lists them and asks for a name
# (or --all).
#
# Every deploy also carries the current supabase/functions/_shared/ alongside
# the function itself (calculation-math.ts, commercial-industrial/, ...).
# Each entry — the function itself, and each _shared child — is replaced
# wholesale on the remote (backed up, then rm -rf + cp -a) to exactly match
# what's in this repo, mirroring migrate_functions' own copy loop. Nothing
# outside those entries is touched.
#
# Requires .env.tunnel.local at the repo root (same file db-push-tunnel.sh
# uses) — only SSH_HOST is needed here, defaulting to "hostinger" like that
# script. EDGE_CONTAINER and FUNCTIONS_VOLUME are auto-discovered but can be
# overridden in the same file.
#
# The SSH user needs: docker CLI access (same as db-push-tunnel.sh already
# assumes) and sudo rights to read/write inside the functions volume and
# restart the container — the same requirement
# migrate-supabase-cloud-to-selfhosted-v5.sh has when run on the server
# itself. The actual deploy step runs over `ssh -t` (as its own file, not a
# heredoc, so stdin stays free) so an interactive sudo password prompt works
# if the account isn't set up with NOPASSWD. The read-only status check has
# no tty to prompt on, though — it needs NOPASSWD sudo to compare content;
# without it, entries just show up as unverified instead of hanging.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ASSUME_YES=false
DRY_RUN=false
CHECK_ONLY=false
DEPLOY_ALL=false
FUNCTION_NAME=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
    --dry-run) DRY_RUN=true ;;
    --check) CHECK_ONLY=true ;;
    --all) DEPLOY_ALL=true ;;
    -*) echo "Unknown option: $arg" >&2; exit 1 ;;
    *)
      if [ -n "$FUNCTION_NAME" ]; then
        echo "Only one function name is supported at a time (use --all for every pending one)." >&2
        exit 1
      fi
      FUNCTION_NAME="$arg"
      ;;
  esac
done

if [ -n "$FUNCTION_NAME" ] && [ ! -f "supabase/functions/$FUNCTION_NAME/index.ts" ]; then
  echo "Error: supabase/functions/$FUNCTION_NAME/index.ts not found." >&2
  echo "Available functions:" >&2
  find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_shared' ! -name 'node_modules' -exec basename {} \; \
    | sed 's/^/  /' >&2
  exit 1
fi

ENV_FILE=".env.tunnel.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found." >&2
  echo 'Create it with at least: DB_URL="..."  (see .env.tunnel.local.example)' >&2
  exit 1
fi
set -a
source "$ENV_FILE"
set +a

SSH_HOST="${SSH_HOST:-hostinger}"
EDGE_CONTAINER="${EDGE_CONTAINER:-}"
FUNCTIONS_VOLUME="${FUNCTIONS_VOLUME:-}"
SSH_OPTS=(-o ConnectTimeout=10)

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

if [ -z "$EDGE_CONTAINER" ]; then
  echo "Discovering the remote Edge Runtime container..."
  EDGE_CONTAINER=$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
    "docker ps --filter 'name=^supabase-edge-functions-' --format '{{.Names}}' | head -n 1")
fi
if [ -z "$EDGE_CONTAINER" ]; then
  echo "Error: no running supabase-edge-functions-* container was found on $SSH_HOST." >&2
  echo "Set EDGE_CONTAINER in $ENV_FILE or verify the Supabase stack." >&2
  exit 1
fi

if [ -z "$FUNCTIONS_VOLUME" ]; then
  FUNCTIONS_VOLUME=$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
    "docker inspect '$EDGE_CONTAINER' --format '{{range .Mounts}}{{if eq .Destination \"/home/deno/functions\"}}{{println .Source}}{{end}}{{end}}'" \
    | head -n1 | xargs || true)
fi
if [ -z "$FUNCTIONS_VOLUME" ]; then
  echo "Error: no /home/deno/functions mount found on $EDGE_CONTAINER." >&2
  echo "Set FUNCTIONS_VOLUME in $ENV_FILE." >&2
  exit 1
fi

echo "=== Target ==="
echo "SSH host:         $SSH_HOST"
echo "Edge container:   $EDGE_CONTAINER"
echo "Functions volume: $FUNCTIONS_VOLUME"
echo

ALL_FUNCTIONS=()
while IFS= read -r -d '' d; do
  ALL_FUNCTIONS+=("$(basename "$d")")
done < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_shared' ! -name 'node_modules' -print0 | sort -z)

SHARED_ENTRIES=()
while IFS= read -r -d '' entry; do
  SHARED_ENTRIES+=("$(basename "$entry")")
done < <(find supabase/functions/_shared -mindepth 1 -maxdepth 1 -print0)

remote_path_exists() {
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "sudo test -e '$1'" 2>/dev/null
}

local_manifest() {
  # sha256 of every file under $1, relative paths, sorted — comparable
  # byte-for-byte against remote_manifest's output for the same directory.
  ( cd "$1" 2>/dev/null && find . -type f ! -name '*.test.ts' -print0 | sort -z | xargs -0 sha256sum ) 2>/dev/null
}

remote_manifest() {
  # One sudo call so every file is readable regardless of ownership, instead
  # of needing per-file sudo. Empty output means "couldn't read" (missing,
  # denied, or genuinely empty) — the caller checks existence separately to
  # tell those apart.
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
    "sudo bash -c 'cd \"$1\" 2>/dev/null && find . -type f ! -name \"*.test.ts\" -print0 | sort -z | xargs -0 sha256sum'" 2>/dev/null
}

# Returns 0 (in sync), 1 (differs) or 2 (couldn't compare) — never prints;
# callers that need to know why "couldn't compare" happened should check
# remote_path_exists separately.
manifests_match() {
  local local_dir="$1" remote_dir="$2" local_m remote_m
  local_m=$(local_manifest "$local_dir") || true
  remote_m=$(remote_manifest "$remote_dir") || true
  [ -n "$remote_m" ] || return 2
  [ "$local_m" = "$remote_m" ] && return 0 || return 1
}

# Populates the global PENDING array and prints one line per function plus
# one for _shared. A function is pending when it was never deployed, its own
# files differ, or _shared differs (since every function reads from it).
check_status() {
  echo "=== Status (comparing this repo against $SSH_HOST) ==="
  PENDING=()

  local shared_pending=false
  local shared_rc=0
  manifests_match "supabase/functions/_shared" "$FUNCTIONS_VOLUME/_shared" || shared_rc=$?
  case "$shared_rc" in
    0) echo "  _shared: em dia" ;;
    1) shared_pending=true; echo "  _shared: desatualizado" ;;
    *) echo "  _shared: não foi possível comparar o conteúdo (permissão) — ignorando essa checagem" ;;
  esac
  echo

  local name remote_dir status rc
  for name in "${ALL_FUNCTIONS[@]}"; do
    remote_dir="$FUNCTIONS_VOLUME/$name"
    if ! remote_path_exists "$remote_dir"; then
      status="nunca implantada"
    else
      rc=0
      manifests_match "supabase/functions/$name" "$remote_dir" || rc=$?
      if [ "$rc" -eq 0 ]; then
        if [ "$shared_pending" = true ]; then status="_shared desatualizado"; else status="em dia"; fi
      elif [ "$rc" -eq 1 ]; then
        status="desatualizada"
      else
        status="implantada (conteúdo não verificado — permissão negada)"
      fi
    fi
    printf '  %-32s %s\n' "$name" "$status"
    case "$status" in
      "nunca implantada"|"desatualizada"|"_shared desatualizado") PENDING+=("$name") ;;
    esac
  done
  echo
}

deploy_one() {
  local name="$1" function_dir="supabase/functions/$1"
  local remote_tmp="/tmp/edge-deploy-$name-$$"
  local staging

  echo "--- Deploying $name ---"
  if ! confirm "Deploy $name to $SSH_HOST and restart the Edge Runtime?"; then
    echo "Skipped."
    return 1
  fi

  staging=$(mktemp -d)

  echo "Packaging $function_dir and supabase/functions/_shared/..."
  mkdir -p "$staging/$name" "$staging/_shared"
  cp -a "$function_dir/." "$staging/$name/"
  cp -a "supabase/functions/_shared/." "$staging/_shared/"
  find "$staging" -name '*.test.ts' -delete

  # A real file, not a heredoc: the install step below needs `ssh -t` for an
  # interactive sudo prompt, and a heredoc would occupy stdin, defeating the
  # pty allocation (this is exactly what broke on the first version of this
  # script — see git history if curious).
  cat > "$staging/install.sh" <<INSTALL
#!/usr/bin/env bash
set -euo pipefail
FUNCTIONS_VOLUME=${FUNCTIONS_VOLUME@Q}
FUNCTION_NAME=${name@Q}
REMOTE_TMP=${remote_tmp@Q}
EDGE_CONTAINER=${EDGE_CONTAINER@Q}
SHARED_ENTRIES=(${SHARED_ENTRIES[@]@Q})

BACKUP_DIR="\$FUNCTIONS_VOLUME/.deploy-backups/\$(date +%Y%m%d-%H%M%S)-\$FUNCTION_NAME"
sudo mkdir -p "\$BACKUP_DIR"

replace_entry() {
  local name="\$1" src="\$2"
  local dest="\$FUNCTIONS_VOLUME/\$name"
  sudo mkdir -p "\$(dirname "\$dest")" "\$(dirname "\$BACKUP_DIR/\$name")"
  if sudo test -e "\$dest"; then
    sudo cp -a "\$dest" "\$BACKUP_DIR/\$name"
  fi
  sudo rm -rf "\$dest"
  sudo cp -a "\$src" "\$dest"
  echo "Deployed: \$name"
}

replace_entry "\$FUNCTION_NAME" "\$REMOTE_TMP/\$FUNCTION_NAME"
for entry in "\${SHARED_ENTRIES[@]}"; do
  replace_entry "_shared/\$entry" "\$REMOTE_TMP/_shared/\$entry"
done

echo "Restarting Edge Runtime (\$EDGE_CONTAINER)..."
sudo docker restart "\$EDGE_CONTAINER" >/dev/null
INSTALL
  chmod +x "$staging/install.sh"

  echo "Uploading to $SSH_HOST..."
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p '$remote_tmp'"
  tar -czf - -C "$staging" . | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "tar -xzf - -C '$remote_tmp'"
  rm -rf "$staging"

  echo "Installing on the Edge Runtime volume (backing up anything replaced)..."
  ssh -t "${SSH_OPTS[@]}" "$SSH_HOST" "bash '$remote_tmp/install.sh'"

  echo "Waiting for the function to come back up..."
  sleep 3

  local supabase_url="${NEXT_PUBLIC_SUPABASE_URL:-}"
  if [ -z "$supabase_url" ] && [ -f .env.local ]; then
    supabase_url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | head -n1 | cut -d= -f2- | tr -d '"')
  fi

  if [ -n "$supabase_url" ]; then
    echo "Verifying $name responds..."
    local http_status
    http_status=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "${supabase_url%/}/functions/v1/$name" || echo "000")
    if [ "$http_status" = "200" ]; then
      echo "OK: $name is up (HTTP 200)."
    else
      echo "Warning: $name responded with HTTP $http_status instead of 200." >&2
      echo "Check the Edge Runtime logs: ssh $SSH_HOST docker logs $EDGE_CONTAINER" >&2
    fi
  else
    echo "NEXT_PUBLIC_SUPABASE_URL not found (checked env and .env.local) — skipping verification."
    echo "Verify manually: curl -i -X OPTIONS <your-supabase-url>/functions/v1/$name"
  fi

  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "rm -rf '$remote_tmp'" >/dev/null 2>&1 || true
  echo
}

# ─── Pick what to deploy ─────────────────────────────────────────────────

if [ "$CHECK_ONLY" = true ]; then
  check_status
  exit 0
fi

TARGETS=()

if [ -n "$FUNCTION_NAME" ]; then
  TARGETS=("$FUNCTION_NAME")
else
  check_status

  if [ "${#PENDING[@]}" -eq 0 ]; then
    echo "Tudo em dia. Nada para implantar."
    exit 0
  fi

  if [ "$DEPLOY_ALL" = true ] || [ "${#PENDING[@]}" -eq 1 ]; then
    TARGETS=("${PENDING[@]}")
  else
    echo "Mais de uma função pendente: ${PENDING[*]}"
    echo "Rode de novo passando um nome (scripts/deploy-edge-function.sh <nome>) ou use --all."
    exit 1
  fi
fi

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: would deploy ${TARGETS[*]} (plus supabase/functions/_shared/) and restart $EDGE_CONTAINER."
  echo "No changes made."
  exit 0
fi

FAILED=()
for target in "${TARGETS[@]}"; do
  deploy_one "$target" || FAILED+=("$target")
done

if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "Not deployed (skipped or failed): ${FAILED[*]}" >&2
  exit 1
fi
