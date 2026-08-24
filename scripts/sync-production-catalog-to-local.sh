#!/usr/bin/env bash
# Copies the product/catalog data from the self-hosted production database to
# the local Supabase database. It never touches auth, customers, projects,
# orders, events, or quote requests.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
    *) echo "Uso: $0 [--yes]" >&2; exit 2 ;;
  esac
done

ENV_FILE=".env.tunnel.local"
[ -f "$ENV_FILE" ] || { echo "Erro: $ENV_FILE não encontrado." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

: "${DB_URL:?DB_URL não definido em $ENV_FILE}"
SSH_HOST="${SSH_HOST:-hostinger}"
TUNNEL_REMOTE="${TUNNEL_REMOTE:-}"
DB_CONTAINER="${DB_CONTAINER:-}"
LOCAL_PORT="${LOCAL_PORT:-5432}"
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:55422/postgres}"

if command -v pg_dump >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  pg_dump_cmd=(pg_dump)
  psql_cmd=(psql)
elif command -v docker >/dev/null 2>&1; then
  echo "Cliente PostgreSQL do sistema não encontrado; usando postgres:17-alpine via Docker."
  pg_dump_cmd=(docker run --rm --network host postgres:17-alpine pg_dump)
  psql_cmd=(docker run --rm --network host postgres:17-alpine psql)
else
  echo "Erro: pg_dump/psql não encontrados e Docker indisponível." >&2
  exit 1
fi

TABLES=(
  load_catalog
  load_presets
  inverters
  batteries
  accessories
  accessory_rules
  ess_compatibility_rules
  approved_solutions
)

confirm() {
  [ "$ASSUME_YES" = true ] && return 0
  local answer
  read -r -p "$1 [y/N] " answer
  case "$answer" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

if [ -z "$TUNNEL_REMOTE" ]; then
  echo "Descobrindo o container Postgres de produção..."
  [ -n "$DB_CONTAINER" ] || DB_CONTAINER=$(ssh -o ConnectTimeout=10 "$SSH_HOST" \
    "docker ps --filter 'name=^supabase-db-' --format '{{.Names}}' | head -n 1")
  [ -n "$DB_CONTAINER" ] || { echo "Nenhum container supabase-db encontrado." >&2; exit 1; }

  NETWORK_ROWS=$(ssh -o ConnectTimeout=10 "$SSH_HOST" \
    "docker inspect -f '{{range \$name,\$network := .NetworkSettings.Networks}}{{printf \"%s=%s\\n\" \$name \$network.IPAddress}}{{end}}' '$DB_CONTAINER'")
  while IFS='=' read -r _network_name ip_address; do
    [ -n "$ip_address" ] || continue
    if ssh -o ConnectTimeout=10 "$SSH_HOST" "timeout 2 bash -c '</dev/tcp/$ip_address/5432'" >/dev/null 2>&1; then
      TUNNEL_REMOTE="$ip_address:5432"
      break
    fi
  done <<< "$NETWORK_ROWS"
fi

[ -n "$TUNNEL_REMOTE" ] || { echo "Não foi possível descobrir o destino do túnel." >&2; exit 1; }

WORK_DIR=$(mktemp -d)
BACKUP_DIR="${CATALOG_BACKUP_DIR:-$PWD/.local-backups}"
mkdir -p "$BACKUP_DIR"
TUNNEL_PID=""
cleanup() {
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$TUNNEL_PID" ] && wait "$TUNNEL_PID" 2>/dev/null || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "Produção: $SSH_HOST via localhost:$LOCAL_PORT -> $TUNNEL_REMOTE"
echo "Destino local: $LOCAL_DB_URL"
echo "Tabelas: ${TABLES[*]}"
confirm "Exportar produção e substituir somente o catálogo local?" || { echo "Cancelado."; exit 0; }

ssh -o ExitOnForwardFailure=yes -o ConnectTimeout=10 \
  -L "$LOCAL_PORT:$TUNNEL_REMOTE" -N "$SSH_HOST" &
TUNNEL_PID=$!
for _ in $(seq 1 30); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$LOCAL_PORT") 2>/dev/null; then
    exec 3>&- 3<&-
    break
  fi
  sleep 1
done
kill -0 "$TUNNEL_PID" 2>/dev/null || { echo "O túnel SSH não iniciou." >&2; exit 1; }

DUMP_FILE="$WORK_DIR/production-catalog.sql"
BACKUP_FILE="$BACKUP_DIR/catalog-$(date +%Y%m%d-%H%M%S).sql"
TABLE_ARGS=()
for table in "${TABLES[@]}"; do TABLE_ARGS+=("--table=public.$table"); done

echo "Exportando catálogo de produção..."
"${pg_dump_cmd[@]}" --dbname="$DB_URL" --data-only --no-owner --no-privileges "${TABLE_ARGS[@]}" > "$DUMP_FILE"

echo "Salvando backup do catálogo local..."
"${pg_dump_cmd[@]}" --dbname="$LOCAL_DB_URL" --data-only --no-owner --no-privileges "${TABLE_ARGS[@]}" > "$BACKUP_FILE"

echo "Limpando somente tabelas de catálogo local..."
"${psql_cmd[@]}" --dbname="$LOCAL_DB_URL" --set=ON_ERROR_STOP=1 --command='
begin;
delete from public.accessory_rules;
delete from public.ess_compatibility_rules;
delete from public.approved_solutions;
delete from public.accessories;
delete from public.inverters;
delete from public.batteries;
delete from public.load_catalog;
delete from public.load_presets;
commit;
'

echo "Importando catálogo de produção..."
"${psql_cmd[@]}" --dbname="$LOCAL_DB_URL" --set=ON_ERROR_STOP=1 --single-transaction < "$DUMP_FILE"
echo "Catálogo sincronizado com sucesso. Backup local: $BACKUP_FILE"
