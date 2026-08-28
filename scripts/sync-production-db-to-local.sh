#!/usr/bin/env bash
# Copies auth/public/storage data from the self-hosted production database to
# the local Supabase database through the same SSH tunnel flow used for
# migrations. It never changes production, but it fully replaces local test
# data after taking a backup.
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
BACKUP_DIR="${FULL_DB_BACKUP_DIR:-$PWD/.local-backups}"
mkdir -p "$BACKUP_DIR"

STORAGE_TABLES=(
  storage.buckets
  storage.objects
  storage.s3_multipart_uploads
  storage.s3_multipart_uploads_parts
)

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
TUNNEL_PID=""
cleanup() {
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$TUNNEL_PID" ] && wait "$TUNNEL_PID" 2>/dev/null || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

DUMP_FILE="$WORK_DIR/production-full.sql"
BACKUP_FILE="$BACKUP_DIR/full-db-$(date +%Y%m%d-%H%M%S).sql"
STORAGE_TABLE_ARGS=()
for table in "${STORAGE_TABLES[@]}"; do
  STORAGE_TABLE_ARGS+=("--table=$table")
done

echo "Produção: $SSH_HOST via localhost:$LOCAL_PORT -> $TUNNEL_REMOTE"
echo "Origem remota: $DB_URL"
echo "Destino local: $LOCAL_DB_URL"
echo "Escopo: dados dos schemas auth, public e storage"
echo "Backup local: $BACKUP_FILE"
echo
echo "Isso substitui completamente os dados locais de teste, incluindo auth.users,"
echo "profiles, clientes, projetos, pedidos e objetos do Storage registrados no banco."
echo
confirm "Continuar com o clone da produção para o banco local?" || { echo "Cancelado."; exit 0; }

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

echo "Exportando backup do banco local..."
"${pg_dump_cmd[@]}" \
  --dbname="$LOCAL_DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --schema=auth \
  --schema=public \
  "${STORAGE_TABLE_ARGS[@]}" \
  > "$BACKUP_FILE"

echo "Exportando dados de produção..."
"${pg_dump_cmd[@]}" \
  --dbname="$DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --schema=auth \
  --schema=public \
  "${STORAGE_TABLE_ARGS[@]}" \
  --exclude-table-data=supabase_migrations.schema_migrations \
  > "$DUMP_FILE"

echo "Limpando dados locais dos schemas auth/public/storage..."
"${psql_cmd[@]}" --dbname="$LOCAL_DB_URL" --set=ON_ERROR_STOP=1 <<'SQL'
begin;
do $$
declare
  table_list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by schemaname, tablename)
    into table_list
  from pg_tables
  where (
      schemaname in ('auth', 'public')
      and tablename not in ('schema_migrations', 'spatial_ref_sys')
    )
    or (
      schemaname = 'storage'
      and tablename in ('buckets', 'objects', 's3_multipart_uploads', 's3_multipart_uploads_parts')
    );

  if table_list is not null then
    execute 'truncate table ' || table_list || ' cascade';
  end if;
end $$;
commit;
SQL

echo "Importando dados de produção no Supabase local..."
"${psql_cmd[@]}" --dbname="$LOCAL_DB_URL" --set=ON_ERROR_STOP=1 --single-transaction < "$DUMP_FILE"

echo "Clone concluído com sucesso."
echo "Backup do banco local salvo em: $BACKUP_FILE"
