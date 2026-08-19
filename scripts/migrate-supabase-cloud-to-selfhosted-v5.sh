#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# Supabase Cloud -> Self-hosted migration helper v5
#
# Migra:
#   - roles
#   - schema
#   - dados / Auth compatível
#   - Storage (buckets + objetos)
#   - Edge Functions
#
# Também:
#   - migra o banco ANTES do Storage, evitando uploads quando o restore falha
#   - corrige URLs absolutas antigas do Storage em text/varchar/citext/json/jsonb
#   - compara origem x destino e gera relatório final
#   - valida origem/destino antes de começar
#   - detecta conflitos de tabelas/PKs do schema antes do restore
#   - detecta Auth incompatível sem descartar dados silenciosamente
#
# NÃO migra automaticamente:
#   - valores de secrets customizados das Edge Functions
#   - SMTP / OAuth / Auth settings
#   - import maps / deno.json que o CLI não baixar da plataforma
#
# Requisitos:
#   bash, curl, jq, file, python3, docker, Supabase CLI
# ==============================================================================

ENV_FILE="${ENV_FILE:-}"

CLI_MIGRATE_DB=""
CLI_MIGRATE_STORAGE=""
CLI_MIGRATE_FUNCTIONS=""
CLI_REWRITE_STORAGE_URLS=""
CLI_REWRITE_URLS_ONLY=0

usage() {
  cat <<'EOF'
Uso:
  ./migrate-supabase-cloud-to-selfhosted.sh [opções]

Opções:
  --env ARQUIVO       Carrega configuração com "source ARQUIVO"

  --all               Migra banco + Storage + Edge Functions
  --db-only           Migra somente banco
  --storage-only      Migra somente Storage
  --functions-only    Migra somente Edge Functions

  --no-db             Desativa banco
  --no-storage        Desativa Storage
  --no-functions      Desativa Edge Functions

  --rewrite-urls      Ativa correção de URLs antigas do Storage
  --rewrite-urls-only Corrige URLs no banco sem migrar DB/Storage/Functions
  --no-rewrite-urls   Desativa correção de URLs antigas do Storage

  -h, --help          Mostra esta ajuda

Exemplos:
  ./migrate-supabase-cloud-to-selfhosted.sh --env supabase-migration.env --all
  ./migrate-supabase-cloud-to-selfhosted.sh --env supabase-migration.env --db-only
  ./migrate-supabase-cloud-to-selfhosted.sh --env supabase-migration.env --storage-only
  ./migrate-supabase-cloud-to-selfhosted.sh --env supabase-migration.env --functions-only
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      [[ $# -ge 2 ]] || { echo "ERRO: --env exige um arquivo." >&2; exit 1; }
      ENV_FILE="$2"
      shift 2
      ;;
    --all)
      CLI_MIGRATE_DB=1
      CLI_MIGRATE_STORAGE=1
      CLI_MIGRATE_FUNCTIONS=1
      shift
      ;;
    --db-only)
      CLI_MIGRATE_DB=1
      CLI_MIGRATE_STORAGE=0
      CLI_MIGRATE_FUNCTIONS=0
      shift
      ;;
    --storage-only)
      CLI_MIGRATE_DB=0
      CLI_MIGRATE_STORAGE=1
      CLI_MIGRATE_FUNCTIONS=0
      shift
      ;;
    --functions-only)
      CLI_MIGRATE_DB=0
      CLI_MIGRATE_STORAGE=0
      CLI_MIGRATE_FUNCTIONS=1
      shift
      ;;
    --no-db)
      CLI_MIGRATE_DB=0
      shift
      ;;
    --no-storage)
      CLI_MIGRATE_STORAGE=0
      shift
      ;;
    --no-functions)
      CLI_MIGRATE_FUNCTIONS=0
      shift
      ;;
    --rewrite-urls)
      CLI_REWRITE_STORAGE_URLS=1
      shift
      ;;
    --rewrite-urls-only)
      CLI_MIGRATE_DB=0
      CLI_MIGRATE_STORAGE=0
      CLI_MIGRATE_FUNCTIONS=0
      CLI_REWRITE_STORAGE_URLS=1
      CLI_REWRITE_URLS_ONLY=1
      shift
      ;;
    --no-rewrite-urls)
      CLI_REWRITE_STORAGE_URLS=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERRO: opção desconhecida: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "$ENV_FILE" ]]; then
  [[ -f "$ENV_FILE" ]] || { echo "ERRO: arquivo não encontrado: $ENV_FILE" >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$ENV_FILE"
elif [[ -f "./supabase-migration.env" ]]; then
  # shellcheck disable=SC1091
  source "./supabase-migration.env"
fi

[[ -n "$CLI_MIGRATE_DB" ]] && MIGRATE_DB="$CLI_MIGRATE_DB"
[[ -n "$CLI_MIGRATE_STORAGE" ]] && MIGRATE_STORAGE="$CLI_MIGRATE_STORAGE"
[[ -n "$CLI_MIGRATE_FUNCTIONS" ]] && MIGRATE_FUNCTIONS="$CLI_MIGRATE_FUNCTIONS"
[[ -n "$CLI_REWRITE_STORAGE_URLS" ]] && REWRITE_STORAGE_URLS="$CLI_REWRITE_STORAGE_URLS"

: "${SOURCE_PROJECT_REF:?Defina SOURCE_PROJECT_REF}"
SOURCE_SUPABASE_URL="${SOURCE_SUPABASE_URL:-https://${SOURCE_PROJECT_REF}.supabase.co}"
SOURCE_DB_URL="${SOURCE_DB_URL:-}"
: "${SOURCE_SERVICE_ROLE_KEY:?Defina SOURCE_SERVICE_ROLE_KEY}"
: "${DEST_SUPABASE_URL:?Defina DEST_SUPABASE_URL}"
: "${DEST_SERVICE_ROLE_KEY:?Defina DEST_SERVICE_ROLE_KEY}"

SOURCE_SUPABASE_URL="${SOURCE_SUPABASE_URL%/}"
DEST_SUPABASE_URL="${DEST_SUPABASE_URL%/}"

MIGRATION_NAME="${MIGRATION_NAME:-$SOURCE_PROJECT_REF}"
WORK_ROOT="${WORK_ROOT:-$HOME/supabase-migration}"
WORK_DIR="${WORK_DIR:-$WORK_ROOT/$MIGRATION_NAME}"

DUMP_DIR="$WORK_DIR/dump"
STORAGE_DIR="$WORK_DIR/storage"
REPORT_DIR="$WORK_DIR/reports"
EDGE_BACKUP_DIR="$WORK_DIR/edge-backups"

MIGRATE_DB="${MIGRATE_DB:-1}"
MIGRATE_STORAGE="${MIGRATE_STORAGE:-1}"
MIGRATE_FUNCTIONS="${MIGRATE_FUNCTIONS:-1}"
REWRITE_STORAGE_URLS="${REWRITE_STORAGE_URLS:-1}"

ALLOW_DROP_INCOMPAT_AUTH="${ALLOW_DROP_INCOMPAT_AUTH:-0}"
ALLOW_NONEMPTY_DESTINATION="${ALLOW_NONEMPTY_DESTINATION:-0}"
AUTO_CONFIRM="${AUTO_CONFIRM:-0}"

DB_CONTAINER="${DB_CONTAINER:-}"
EDGE_CONTAINER="${EDGE_CONTAINER:-}"

mkdir -p "$DUMP_DIR" "$STORAGE_DIR" "$REPORT_DIR" "$EDGE_BACKUP_DIR"

RUN_ID="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$WORK_DIR/migration-$RUN_ID.log"
RUN_DIR="$WORK_DIR/runs/$RUN_ID"
mkdir -p "$RUN_DIR"
REPORT_FILE="$REPORT_DIR/migration-report-$RUN_ID.txt"

SOURCE_TABLE_COUNTS_FILE="$RUN_DIR/source-table-counts.tsv"
SOURCE_STORAGE_COUNTS_FILE="$RUN_DIR/source-storage-counts.tsv"
SOURCE_FUNCTIONS_FILE="$RUN_DIR/source-functions.txt"
EDGE_ENV_VARS_FILE="$RUN_DIR/edge-env-vars.txt"
FUNCTION_LIST_JSON="$RUN_DIR/source-functions.json"

URL_REWRITE_ROWS=0
URL_REWRITE_REFERENCES=0
FUNCTIONS_VOLUME=""
CURRENT_PHASE="preflight"

exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

warn() {
  echo "AVISO: $*" >&2
}

die() {
  echo "ERRO: $*" >&2
  exit 1
}

on_error() {
  local rc=$?
  local line="${BASH_LINENO[0]:-?}"
  echo "ERRO inesperado na linha $line (exit=$rc)." >&2
  echo "Fase: $CURRENT_PHASE" >&2

  if [[ "$CURRENT_PHASE" == "database" ]]; then
    echo "O restore do banco usa transação única; uma falha durante o psql deve reverter o bloco de restore." >&2
    echo "Na execução --all, Storage e Edge Functions ainda não terão sido iniciados." >&2
  fi

  echo "Consulte o log: $LOG_FILE" >&2
  exit "$rc"
}

trap on_error ERR

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "comando não encontrado: $1"
}


source_db_dump() {
  local args=(db dump)

  if [[ -n "$SOURCE_DB_URL" ]]; then
    args+=(--db-url "$SOURCE_DB_URL")
  else
    args+=(--linked)
  fi

  sudo -E supabase "${args[@]}" "$@"
}

warn_env_permissions() {
  [[ -n "$ENV_FILE" ]] || return 0
  [[ -f "$ENV_FILE" ]] || return 0

  local mode
  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)"

  if [[ -n "$mode" ]]; then
    local last_two="${mode: -2}"
    if [[ "$last_two" != "00" ]]; then
      warn "$ENV_FILE contém secrets e está com modo $mode. Recomendado: chmod 600 '$ENV_FILE'"
    fi
  fi
}

urlencode_path() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe="/"))
PY
}

detect_mime() {
  local f="$1"
  local m

  m="$(file --mime-type -b -- "$f" 2>/dev/null || true)"

  if [[ -z "$m" || "$m" == "application/octet-stream" ]]; then
    case "${f,,}" in
      *.png)         m="image/png" ;;
      *.jpg|*.jpeg)  m="image/jpeg" ;;
      *.webp)        m="image/webp" ;;
      *.gif)         m="image/gif" ;;
      *.svg)         m="image/svg+xml" ;;
      *.pdf)         m="application/pdf" ;;
      *.ttf)         m="font/sfnt" ;;
      *.otf)         m="font/otf" ;;
      *.woff)        m="font/woff" ;;
      *.woff2)       m="font/woff2" ;;
      *.mp4)         m="video/mp4" ;;
      *.mov)         m="video/quicktime" ;;
      *.webm)        m="video/webm" ;;
      *.mp3)         m="audio/mpeg" ;;
      *.wav)         m="audio/wav" ;;
      *.json)        m="application/json" ;;
      *.txt)         m="text/plain" ;;
      *.csv)         m="text/csv" ;;
      *)             m="application/octet-stream" ;;
    esac
  fi

  printf '%s' "$m"
}

comment_transaction_timeout() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  sed -i 's/^SET transaction_timeout/-- &/' "$file"
}

find_db_container() {
  if [[ -n "$DB_CONTAINER" ]]; then
    sudo docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "DB_CONTAINER '$DB_CONTAINER' não existe."
    return
  fi

  mapfile -t matches < <(
    sudo docker ps --format '{{.Names}}' | grep '^supabase-db-' || true
  )

  [[ ${#matches[@]} -gt 0 ]] || die "nenhum container supabase-db-* encontrado."

  if [[ ${#matches[@]} -gt 1 ]]; then
    echo "Foram encontrados vários bancos:"
    printf '  %s\n' "${matches[@]}"
    die "defina DB_CONTAINER no supabase-migration.env."
  fi

  DB_CONTAINER="${matches[0]}"
}

find_edge_container() {
  if [[ -n "$EDGE_CONTAINER" ]]; then
    sudo docker inspect "$EDGE_CONTAINER" >/dev/null 2>&1 || die "EDGE_CONTAINER '$EDGE_CONTAINER' não existe."
  else
    if [[ "$DB_CONTAINER" =~ ^supabase-db-(.+)$ ]]; then
      local suffix="${BASH_REMATCH[1]}"
      local candidate="supabase-edge-functions-$suffix"

      if sudo docker inspect "$candidate" >/dev/null 2>&1; then
        EDGE_CONTAINER="$candidate"
      fi
    fi

    if [[ -z "$EDGE_CONTAINER" ]]; then
      mapfile -t matches < <(
        sudo docker ps --format '{{.Names}}' | grep '^supabase-edge-functions-' || true
      )

      [[ ${#matches[@]} -gt 0 ]] || die "nenhum container supabase-edge-functions-* encontrado."

      if [[ ${#matches[@]} -gt 1 ]]; then
        echo "Foram encontrados vários Edge Runtimes:"
        printf '  %s\n' "${matches[@]}"
        die "defina EDGE_CONTAINER no supabase-migration.env."
      fi

      EDGE_CONTAINER="${matches[0]}"
    fi
  fi

  FUNCTIONS_VOLUME="$(
    sudo docker inspect "$EDGE_CONTAINER" \
      --format '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{println .Source}}{{end}}{{end}}' \
      | head -n1 | xargs
  )"

  [[ -n "$FUNCTIONS_VOLUME" ]] || die "não encontrei o mount /home/deno/functions em $EDGE_CONTAINER"
}

dest_psql() {
  sudo docker exec "$DB_CONTAINER" psql -X -U postgres -d postgres "$@"
}

normalize_copy_targets() {
  python3 - "$1" <<'PY'
import re
import sys

path = sys.argv[1]
rx = re.compile(
    r'^COPY\s+'
    r'(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.'
    r'(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))'
    r'(?:\s|\()'
)

targets = set()

with open(path, "r", encoding="utf-8", errors="replace") as f:
    for line in f:
        m = rx.match(line)
        if not m:
            continue
        schema = m.group(1) or m.group(2)
        table = m.group(3) or m.group(4)
        targets.add(f"{schema}.{table}")

for target in sorted(targets):
    print(target)
PY
}

count_copy_rows() {
  local dump_file="$1"
  local target="$2"

  python3 - "$dump_file" "$target" <<'PY'
import re
import sys

path, wanted = sys.argv[1], sys.argv[2]
rx = re.compile(
    r'^COPY\s+'
    r'(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.'
    r'(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))'
    r'(?:\s|\()'
)

current = None
count = 0

with open(path, "r", encoding="utf-8", errors="replace") as f:
    for raw in f:
        if current:
            if raw.rstrip("\n") == r"\.":
                current = None
                continue
            if current == wanted:
                count += 1
            continue

        m = rx.match(raw)
        if m:
            schema = m.group(1) or m.group(2)
            table = m.group(3) or m.group(4)
            current = f"{schema}.{table}"

print(count)
PY
}

write_source_table_counts() {
  local dump_file="$1"
  local out_file="$2"

  python3 - "$dump_file" "$out_file" <<'PY'
import re
import sys

path, out = sys.argv[1], sys.argv[2]
rx = re.compile(
    r'^COPY\s+'
    r'(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.'
    r'(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))'
    r'(?:\s|\()'
)

counts = {}
current = None

with open(path, "r", encoding="utf-8", errors="replace") as f:
    for raw in f:
        if current:
            if raw.rstrip("\n") == r"\.":
                current = None
                continue
            counts[current] = counts.get(current, 0) + 1
            continue

        m = rx.match(raw)
        if m:
            schema = m.group(1) or m.group(2)
            table = m.group(3) or m.group(4)
            current = f"{schema}.{table}"
            counts.setdefault(current, 0)

with open(out, "w", encoding="utf-8") as f:
    for target in sorted(counts):
        if target.startswith("public.") or target == "auth.users":
            f.write(f"{target}\t{counts[target]}\n")
PY
}

table_exists_dest() {
  local target="$1"
  local exists

  exists="$(
    dest_psql -tAc "SELECT CASE WHEN to_regclass('$target') IS NULL THEN '0' ELSE '1' END;"
  )"

  [[ "$exists" == "1" ]]
}

count_dest_table() {
  local target="$1"
  local schema="${target%%.*}"
  local table="${target#*.}"
  local sql

  sql="$(
    dest_psql -At \
      -v schema_name="$schema" \
      -v table_name="$table" \
      -c "
        SELECT CASE
          WHEN to_regclass(format('%I.%I', :'schema_name', :'table_name')) IS NULL THEN ''
          ELSE format('SELECT count(*) FROM %I.%I;', :'schema_name', :'table_name')
        END;
      "
  )"

  if [[ -z "$sql" ]]; then
    printf 'MISSING'
    return
  fi

  dest_psql -Atc "$sql"
}

assert_destination_safe_for_restore() {
  [[ "$ALLOW_NONEMPTY_DESTINATION" == "1" ]] && {
    warn "ALLOW_NONEMPTY_DESTINATION=1: proteção contra restore sobre destino existente desativada."
    return
  }

  local public_tables
  local auth_users

  public_tables="$(
    dest_psql -Atc "
      SELECT count(*)
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_type='BASE TABLE';
    "
  )"

  auth_users="$(
    dest_psql -Atc "SELECT count(*) FROM auth.users;" 2>/dev/null || echo 0
  )"

  if [[ "$public_tables" -gt 0 || "$auth_users" -gt 0 ]]; then
    echo
    echo "Destino não está vazio:"
    echo "  tabelas public: $public_tables"
    echo "  auth.users:     $auth_users"
    echo
    die "restore bloqueado para evitar duplicação/sobrescrita. Use uma instância nova ou ALLOW_NONEMPTY_DESTINATION=1 conscientemente."
  fi
}


# O Supabase CLI torna parte do schema idempotente com IF NOT EXISTS. Isso é útil,
# mas pode mascarar uma tabela já existente e só falhar mais tarde ao adicionar a PK.
# Este preflight detecta exatamente esse tipo de conflito antes do psql.
assert_no_schema_object_conflicts() {
  local schema_file="$1"
  local targets_file="$RUN_DIR/schema-object-targets.tsv"
  local conflicts_file="$RUN_DIR/schema-object-conflicts.tsv"

  : > "$targets_file"
  : > "$conflicts_file"

  python3 - "$schema_file" > "$targets_file" <<'PY_SCHEMA_SCAN'
import re
import sys

path = sys.argv[1]
text = open(path, 'r', encoding='utf-8', errors='replace').read()

ident = r'(?:(?:"(?:[^"]|"")+")|(?:[A-Za-z_][A-Za-z0-9_$]*))'
qualified = rf'({ident})(?:\s*\.\s*({ident}))?'


def unquote(value):
    if value is None:
        return None
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace('""', '"')
    return value

found = set()

for m in re.finditer(
    rf'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{qualified}\s*\(',
    text,
    flags=re.IGNORECASE | re.MULTILINE,
):
    first, second = m.group(1), m.group(2)
    if second is None:
        schema, table = 'public', unquote(first)
    else:
        schema, table = unquote(first), unquote(second)
    found.add((schema, table, 'CREATE_TABLE'))

for m in re.finditer(
    rf'ALTER\s+TABLE\s+(?:ONLY\s+)?{qualified}\s+ADD\s+CONSTRAINT\s+{ident}\s+PRIMARY\s+KEY\s*\(',
    text,
    flags=re.IGNORECASE | re.MULTILINE,
):
    first, second = m.group(1), m.group(2)
    if second is None:
        schema, table = 'public', unquote(first)
    else:
        schema, table = unquote(first), unquote(second)
    found.add((schema, table, 'ADD_PRIMARY_KEY'))

for schema, table, kind in sorted(found):
    print(f'{schema}\t{table}\t{kind}')
PY_SCHEMA_SCAN

  while IFS=$'\t' read -r schema table kind; do
    [[ -n "$schema" && -n "$table" ]] || continue

    local exists
    exists="$(
      dest_psql -At \
        -v schema_name="$schema" \
        -v table_name="$table" \
        -c "
          SELECT CASE
            WHEN to_regclass(format('%I.%I', :'schema_name', :'table_name')) IS NULL THEN '0'
            ELSE '1'
          END;
        "
    )"

    [[ "$exists" == "1" ]] || continue

    if [[ "$kind" == "CREATE_TABLE" ]]; then
      printf '%s\t%s\t%s\n' "$schema" "$table" "tabela já existe no destino" >> "$conflicts_file"
      continue
    fi

    local pk_count
    pk_count="$(
      dest_psql -At \
        -v schema_name="$schema" \
        -v table_name="$table" \
        -c "
          SELECT count(*)
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE con.contype = 'p'
            AND n.nspname = :'schema_name'
            AND c.relname = :'table_name';
        "
    )"

    if [[ "$pk_count" -gt 0 ]]; then
      printf '%s\t%s\t%s\n' "$schema" "$table" "PRIMARY KEY já existe no destino" >> "$conflicts_file"
    fi
  done < "$targets_file"

  if [[ -s "$conflicts_file" ]]; then
    echo
    echo "Conflitos detectados entre schema.sql e o destino:"
    awk -F '\t' '{printf "  %-24s %-32s %s\n", $1, $2, $3}' "$conflicts_file"
    echo
    echo "Detalhes: $conflicts_file"
    die "restore bloqueado antes do psql. Limpe os objetos remanescentes da migração anterior ou use uma instância self-hosted nova."
  fi
}

check_endpoint() {
  local label="$1"
  local url="$2"
  local key="$3"

  log "Preflight: $label"

  curl \
    --fail \
    --silent \
    --show-error \
    --connect-timeout 10 \
    --max-time 30 \
    -H "apikey: $key" \
    "$url/auth/v1/health" \
    >/dev/null \
    || die "endpoint inválido/inacessível: $url"

  echo "$label OK: $url"
}

migrate_storage() {
  CURRENT_PHASE="storage"
  log "Lendo configuração dos buckets no Cloud"

  local bucket_json="$WORK_DIR/source-buckets.json"
  : > "$SOURCE_STORAGE_COUNTS_FILE"

  curl \
    --fail \
    --silent \
    --show-error \
    "$SOURCE_SUPABASE_URL/storage/v1/bucket" \
    -H "Authorization: Bearer $SOURCE_SERVICE_ROLE_KEY" \
    -H "apikey: $SOURCE_SERVICE_ROLE_KEY" \
    > "$bucket_json"

  jq -e 'type == "array"' "$bucket_json" >/dev/null || die "resposta inesperada ao listar buckets do Cloud."

  local bucket_count
  bucket_count="$(jq 'length' "$bucket_json")"
  echo "Buckets encontrados: $bucket_count"

  if [[ "$bucket_count" -eq 0 ]]; then
    echo "Nenhum bucket para migrar."
    return
  fi

  while IFS= read -r bucket; do
    log "Storage: $bucket"

    local local_dir="$STORAGE_DIR/$bucket"

    # Evita STORAGE_DIR/bucket/bucket/... em execuções repetidas.
    rm -rf "$local_dir"
    mkdir -p "$STORAGE_DIR"

    # O CLI cria STORAGE_DIR/<bucket>/...
    supabase storage cp \
      "ss:///$bucket" \
      "$STORAGE_DIR/" \
      --recursive \
      --experimental

    # Defesa caso uma versão do CLI ainda produza bucket/bucket.
    if [[ -d "$local_dir/$bucket" ]]; then
      warn "detectado diretório duplicado '$bucket/$bucket'; usando o nível interno."
      local_dir="$local_dir/$bucket"
    fi

    [[ -d "$local_dir" ]] || die "diretório local do bucket não encontrado: $local_dir"

    local local_count
    local_count="$(find "$local_dir" -type f | wc -l | tr -d ' ')"

    printf '%s\t%s\n' "$bucket" "$local_count" >> "$SOURCE_STORAGE_COUNTS_FILE"

    echo "Arquivos locais: $local_count"

    local public
    local file_size_limit
    local source_allowed
    local allowed_json

    public="$(
      jq -r --arg b "$bucket" '.[] | select(.id==$b) | .public // false' "$bucket_json"
    )"

    file_size_limit="$(
      jq -r --arg b "$bucket" '.[] | select(.id==$b) | .file_size_limit // empty' "$bucket_json"
    )"

    source_allowed="$(
      jq -c --arg b "$bucket" '.[] | select(.id==$b) | .allowed_mime_types' "$bucket_json"
    )"

    if [[ "$source_allowed" == "null" || -z "$source_allowed" ]]; then
      allowed_json="null"
    else
      local mime_file="$WORK_DIR/.mime-$bucket.txt"
      : > "$mime_file"

      while IFS= read -r -d '' f; do
        detect_mime "$f" >> "$mime_file"
        printf '\n' >> "$mime_file"
      done < <(find "$local_dir" -type f -print0)

      allowed_json="$(
        {
          printf '%s\n' "$source_allowed" | jq -r '.[]?'
          cat "$mime_file"
        } | sed '/^$/d' | sort -u | jq -R . | jq -s .
      )"

      rm -f "$mime_file"
    fi

    local payload

    if [[ -n "$file_size_limit" && "$file_size_limit" != "null" ]]; then
      payload="$(
        jq -n \
          --arg id "$bucket" \
          --arg name "$bucket" \
          --argjson public "$public" \
          --argjson limit "$file_size_limit" \
          --argjson allowed "$allowed_json" \
          '{id:$id,name:$name,public:$public,file_size_limit:$limit,allowed_mime_types:$allowed}'
      )"
    else
      payload="$(
        jq -n \
          --arg id "$bucket" \
          --arg name "$bucket" \
          --argjson public "$public" \
          --argjson allowed "$allowed_json" \
          '{id:$id,name:$name,public:$public,file_size_limit:null,allowed_mime_types:$allowed}'
      )"
    fi

    local dest_bucket_exists

    dest_bucket_exists="$(
      curl \
        --fail \
        --silent \
        --show-error \
        "$DEST_SUPABASE_URL/storage/v1/bucket" \
        -H "Authorization: Bearer $DEST_SERVICE_ROLE_KEY" \
        -H "apikey: $DEST_SERVICE_ROLE_KEY" \
      | jq -r --arg b "$bucket" 'map(select(.id==$b)) | length'
    )"

    if [[ "$dest_bucket_exists" -gt 0 ]]; then
      echo "Atualizando configuração do bucket no destino..."

      curl \
        --fail \
        --silent \
        --show-error \
        -X PUT \
        "$DEST_SUPABASE_URL/storage/v1/bucket/$bucket" \
        -H "Authorization: Bearer $DEST_SERVICE_ROLE_KEY" \
        -H "apikey: $DEST_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -d "$(printf '%s' "$payload" | jq 'del(.id,.name)')" \
        >/dev/null
    else
      echo "Criando bucket no destino..."

      curl \
        --fail \
        --silent \
        --show-error \
        -X POST \
        "$DEST_SUPABASE_URL/storage/v1/bucket" \
        -H "Authorization: Bearer $DEST_SERVICE_ROLE_KEY" \
        -H "apikey: $DEST_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        >/dev/null
    fi

    local success=0
    local failed=0

    while IFS= read -r -d '' f; do
      local relative
      local encoded
      local mime
      local response
      local status
      local body
      local curl_rc

      relative="${f#$local_dir/}"
      encoded="$(urlencode_path "$relative")"
      mime="$(detect_mime "$f")"

      printf 'Upload: %s/%s [%s] ... ' "$bucket" "$relative" "$mime"

      set +e

      response="$(
        curl \
          --silent \
          --show-error \
          --retry 3 \
          --retry-delay 2 \
          --retry-all-errors \
          --connect-timeout 15 \
          --max-time 600 \
          -w $'\n%{http_code}' \
          -X POST \
          "$DEST_SUPABASE_URL/storage/v1/object/$bucket/$encoded" \
          -H "Authorization: Bearer $DEST_SERVICE_ROLE_KEY" \
          -H "apikey: $DEST_SERVICE_ROLE_KEY" \
          -H "Content-Type: $mime" \
          -H "x-upsert: true" \
          --data-binary "@$f"
      )"

      curl_rc=$?
      set -e

      if [[ "$curl_rc" -ne 0 ]]; then
        echo "ERRO curl=$curl_rc"
        failed=$((failed + 1))
        continue
      fi

      status="$(printf '%s\n' "$response" | tail -n1)"
      body="$(printf '%s\n' "$response" | sed '$d')"

      if [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
        echo "OK"
        success=$((success + 1))
      else
        echo "ERRO HTTP $status"
        echo "  $body"
        failed=$((failed + 1))
      fi

    done < <(find "$local_dir" -type f -print0)

    echo "Bucket $bucket: sucesso=$success falhas=$failed origem=$local_count"

    [[ "$failed" -eq 0 ]] || die "houve falhas ao enviar o bucket '$bucket'."
    [[ "$success" -eq "$local_count" ]] || die "contagem de uploads não bate no bucket '$bucket'."

  done < <(jq -r '.[].id' "$bucket_json")
}

migrate_db() {
  CURRENT_PHASE="database"
  local roles="$DUMP_DIR/roles.sql"
  local schema="$DUMP_DIR/schema.sql"
  local probe="$DUMP_DIR/data-probe.sql"
  local data="$DUMP_DIR/data-compatible.sql"

  log "Gerando dumps"

  source_db_dump --role-only -f "$roles"
  source_db_dump -f "$schema"
  source_db_dump --data-only --use-copy -f "$probe"

  comment_transaction_timeout "$roles"
  comment_transaction_timeout "$schema"
  comment_transaction_timeout "$probe"

  write_source_table_counts "$probe" "$SOURCE_TABLE_COUNTS_FILE"

  log "Analisando compatibilidade Cloud -> self-hosted"

  mapfile -t targets < <(normalize_copy_targets "$probe")

  declare -a excludes=()
  declare -a incompatible_auth_with_data=()

  for target in "${targets[@]}"; do
    if [[ "$target" == storage.* ]]; then
      excludes+=("$target")
      continue
    fi

    if [[ "$target" == auth.* ]]; then
      if ! table_exists_dest "$target"; then
        local rows
        rows="$(count_copy_rows "$probe" "$target")"

        if [[ "$rows" -gt 0 ]]; then
          echo "Auth incompatível COM dados: $target ($rows registros)"
          incompatible_auth_with_data+=("$target:$rows")
        else
          echo "Auth incompatível vazia: $target -> será excluída"
          excludes+=("$target")
        fi
      fi
    fi
  done

  if [[ ${#incompatible_auth_with_data[@]} -gt 0 ]]; then
    echo
    echo "ATENÇÃO: Cloud possui dados em tabelas Auth inexistentes no destino:"
    printf '  %s\n' "${incompatible_auth_with_data[@]}"
    echo

    if [[ "$ALLOW_DROP_INCOMPAT_AUTH" != "1" ]]; then
      die "restore abortado para evitar perda de Auth. Atualize o supabase-auth ou use ALLOW_DROP_INCOMPAT_AUTH=1 conscientemente."
    fi

    for item in "${incompatible_auth_with_data[@]}"; do
      excludes+=("${item%%:*}")
    done
  fi

  if [[ -n "${EXTRA_EXCLUDES:-}" ]]; then
    # shellcheck disable=SC2206
    local extra=( $EXTRA_EXCLUDES )
    excludes+=("${extra[@]}")
  fi

  if [[ ${#excludes[@]} -gt 0 ]]; then
    mapfile -t excludes < <(printf '%s\n' "${excludes[@]}" | sort -u)
  fi

  echo
  echo "Tabelas excluídas do dump de dados:"
  if [[ ${#excludes[@]} -gt 0 ]]; then
    printf '  %s\n' "${excludes[@]}"
  else
    echo "  nenhuma"
  fi

  local dump_args=(--data-only --use-copy)

  for target in "${excludes[@]}"; do
    dump_args+=(--exclude "$target")
  done

  dump_args+=(-f "$data")

  log "Gerando data-compatible.sql"

  source_db_dump "${dump_args[@]}"
  comment_transaction_timeout "$data"

  if normalize_copy_targets "$data" | grep -q '^storage\.'; then
    echo "Ainda existem tabelas storage.* no dump:"
    normalize_copy_targets "$data" | grep '^storage\.'
    die "dump incompatível; restore não será iniciado."
  fi

  if grep -q '^SET transaction_timeout' "$data"; then
    die "transaction_timeout ainda está ativo no dump."
  fi

  log "Preflight do schema contra o destino"
  assert_no_schema_object_conflicts "$schema"
  assert_destination_safe_for_restore

  log "Resumo antes do restore"

  echo "roles:  $(du -h "$roles" | awk '{print $1}')"
  echo "schema: $(du -h "$schema" | awk '{print $1}')"
  echo "data:   $(du -h "$data" | awk '{print $1}')"

  local current_auth_users
  local current_public_rows

  current_auth_users="$(dest_psql -tAc 'SELECT count(*) FROM auth.users;' 2>/dev/null || echo '?')"

  current_public_rows="$(
    dest_psql -tAc "
      SELECT COALESCE(sum(n_live_tup),0)::bigint
      FROM pg_stat_user_tables
      WHERE schemaname='public';
    " 2>/dev/null || echo '?'
  )"

  echo "Destino antes do restore:"
  echo "  auth.users:          $current_auth_users"
  echo "  linhas public aprox: $current_public_rows"

  if [[ "$AUTO_CONFIRM" != "1" ]]; then
    echo
    echo "ATENÇÃO: restore será executado em:"
    echo "  $DB_CONTAINER"
    echo
    read -r -p "Digite MIGRAR para continuar: " answer
    [[ "$answer" == "MIGRAR" ]] || die "cancelado."
  fi

  log "Copiando dumps para o container"

  sudo docker cp "$roles" "$DB_CONTAINER:/tmp/roles.sql"
  sudo docker cp "$schema" "$DB_CONTAINER:/tmp/schema.sql"
  sudo docker cp "$data" "$DB_CONTAINER:/tmp/data-compatible.sql"

  log "Restaurando banco em transação única"

  sudo docker exec "$DB_CONTAINER" \
    psql \
    -X \
    -U postgres \
    -d postgres \
    --single-transaction \
    --variable ON_ERROR_STOP=1 \
    --file /tmp/roles.sql \
    --file /tmp/schema.sql \
    --command 'SET session_replication_role = replica' \
    --file /tmp/data-compatible.sql

  log "Restore concluído"
}

rewrite_storage_urls() {
  CURRENT_PHASE="rewrite-storage-urls"
  [[ "$REWRITE_STORAGE_URLS" == "1" ]] || {
    log "Correção de URLs do Storage desativada"
    return
  }

  local old_prefix="$SOURCE_SUPABASE_URL/storage/v1/"
  local new_prefix="$DEST_SUPABASE_URL/storage/v1/"

  log "Procurando URLs absolutas antigas do Storage"

  mapfile -t url_columns < <(
    dest_psql -At -F $'	' -c "
      SELECT
        table_schema,
        table_name,
        column_name,
        data_type,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          data_type IN (
            'text',
            'character varying',
            'character',
            'json',
            'jsonb'
          )
          OR udt_name = 'citext'
        )
      ORDER BY table_name, ordinal_position;
    "
  )

  local total_rows=0
  local total_refs=0

  for row in "${url_columns[@]}"; do
    IFS=$'	' read -r schema table column data_type udt_name <<< "$row"

    local stats_sql
    local stats
    local matched_rows
    local matched_refs

    stats_sql="$(
      dest_psql \
        -At \
        -v schema_name="$schema" \
        -v table_name="$table" \
        -v column_name="$column" \
        -v old_prefix="$old_prefix" \
        -v empty="" \
        -c "
          SELECT format(
            'SELECT
               count(*)::bigint,
               COALESCE(
                 sum(
                   (
                     length(%I::text)
                     - length(replace(%I::text, %L, %L))
                   ) / NULLIF(length(%L), 0)
                 ),
                 0
               )::bigint
             FROM %I.%I
             WHERE position(%L in %I::text) > 0;',
            :'column_name',
            :'column_name',
            :'old_prefix',
            :'empty',
            :'old_prefix',
            :'schema_name',
            :'table_name',
            :'old_prefix',
            :'column_name'
          );
        "
    )"

    stats="$(dest_psql -At -F $'	' -c "$stats_sql")"
    IFS=$'	' read -r matched_rows matched_refs <<< "$stats"

    [[ "$matched_rows" =~ ^[0-9]+$ ]] || matched_rows=0
    [[ "$matched_refs" =~ ^[0-9]+$ ]] || matched_refs=0

    [[ "$matched_rows" -gt 0 ]] || continue

    local cast_suffix=""
    case "$data_type" in
      jsonb) cast_suffix="::jsonb" ;;
      json)  cast_suffix="::json" ;;
      *)     cast_suffix="" ;;
    esac

    local update_sql

    update_sql="$(
      dest_psql \
        -At \
        -v schema_name="$schema" \
        -v table_name="$table" \
        -v column_name="$column" \
        -v old_prefix="$old_prefix" \
        -v new_prefix="$new_prefix" \
        -v cast_suffix="$cast_suffix" \
        -c "
          SELECT format(
            'UPDATE %I.%I
             SET %I = (replace(%I::text, %L, %L))%s
             WHERE position(%L in %I::text) > 0;',
            :'schema_name',
            :'table_name',
            :'column_name',
            :'column_name',
            :'old_prefix',
            :'new_prefix',
            :'cast_suffix',
            :'old_prefix',
            :'column_name'
          );
        "
    )"

    dest_psql -v ON_ERROR_STOP=1 -c "$update_sql" >/dev/null

    echo "$schema.$table.$column [$data_type/$udt_name]: $matched_rows linha(s), $matched_refs referência(s)"

    total_rows=$((total_rows + matched_rows))
    total_refs=$((total_refs + matched_refs))
  done

  URL_REWRITE_ROWS="$total_rows"
  URL_REWRITE_REFERENCES="$total_refs"

  echo "Linhas atualizadas:      $URL_REWRITE_ROWS"
  echo "Referências atualizadas: $URL_REWRITE_REFERENCES"
}

count_remaining_old_storage_urls() {
  local old_prefix="$SOURCE_SUPABASE_URL/storage/v1/"
  local total=0

  mapfile -t url_columns < <(
    dest_psql -At -F $'	' -c "
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          data_type IN (
            'text',
            'character varying',
            'character',
            'json',
            'jsonb'
          )
          OR udt_name = 'citext'
        );
    "
  )

  for row in "${url_columns[@]}"; do
    IFS=$'	' read -r schema table column <<< "$row"

    local count_sql
    local n

    count_sql="$(
      dest_psql \
        -At \
        -v schema_name="$schema" \
        -v table_name="$table" \
        -v column_name="$column" \
        -v old_prefix="$old_prefix" \
        -v empty="" \
        -c "
          SELECT format(
            'SELECT COALESCE(
               sum(
                 (
                   length(%I::text)
                   - length(replace(%I::text, %L, %L))
                 ) / NULLIF(length(%L), 0)
               ),
               0
             )::bigint
             FROM %I.%I
             WHERE position(%L in %I::text) > 0;',
            :'column_name',
            :'column_name',
            :'old_prefix',
            :'empty',
            :'old_prefix',
            :'schema_name',
            :'table_name',
            :'old_prefix',
            :'column_name'
          );
        "
    )"

    n="$(dest_psql -Atc "$count_sql")"
    [[ "$n" =~ ^[0-9]+$ ]] && total=$((total + n))
  done

  printf '%s' "$total"
}

extract_function_names() {
  jq -r '
    if type == "array" then
      .[] | (.slug // .name // empty)
    elif (.functions? | type) == "array" then
      .functions[] | (.slug // .name // empty)
    else
      empty
    end
  ' "$FUNCTION_LIST_JSON" | sed '/^$/d' | sort -u
}

extract_edge_env_vars() {
  local functions_dir="$1"

  python3 - "$functions_dir" "$EDGE_ENV_VARS_FILE" <<'PY'
import os
import re
import sys

root, out = sys.argv[1], sys.argv[2]

patterns = [
    re.compile(r"Deno\.env\.get\(\s*[\"']([A-Za-z_][A-Za-z0-9_]*)[\"']\s*\)"),
    re.compile(r"Deno\.env\.get\(\s*`([A-Za-z_][A-Za-z0-9_]*)`\s*\)"),
]

found = set()

for base, _, files in os.walk(root):
    for name in files:
        if not name.endswith((".ts", ".tsx", ".js", ".mjs", ".jsx")):
            continue

        path = os.path.join(base, name)

        try:
            text = open(path, "r", encoding="utf-8", errors="ignore").read()
        except OSError:
            continue

        for rx in patterns:
            found.update(rx.findall(text))

with open(out, "w", encoding="utf-8") as f:
    for name in sorted(found):
        f.write(name + "\n")
PY
}

migrate_functions() {
  CURRENT_PHASE="edge-functions"
  log "Listando Edge Functions no Cloud"

  : > "$SOURCE_FUNCTIONS_FILE"
  : > "$EDGE_ENV_VARS_FILE"

  if ! supabase functions list \
      --project-ref "$SOURCE_PROJECT_REF" \
      -o json \
      > "$FUNCTION_LIST_JSON"; then
    die "não foi possível listar Edge Functions."
  fi

  jq -e . "$FUNCTION_LIST_JSON" >/dev/null 2>&1 || die "saída JSON inválida de 'supabase functions list'."

  extract_function_names > "$SOURCE_FUNCTIONS_FILE"

  local function_count
  function_count="$(grep -cve '^$' "$SOURCE_FUNCTIONS_FILE" || true)"

  echo "Edge Functions encontradas: $function_count"

  if [[ "$function_count" -eq 0 ]]; then
    echo "Nenhuma Edge Function para migrar."
    return
  fi

  find_edge_container

  echo "Edge container:   $EDGE_CONTAINER"
  echo "Functions volume: $FUNCTIONS_VOLUME"

  local functions_dir="$WORK_DIR/supabase/functions"

  rm -rf "$functions_dir"
  mkdir -p "$functions_dir"

  log "Baixando Edge Functions"

  supabase functions download \
    --project-ref "$SOURCE_PROJECT_REF" \
    --use-api

  [[ -d "$functions_dir" ]] || die "diretório de funções não foi criado: $functions_dir"

  extract_edge_env_vars "$functions_dir"

  log "Copiando Edge Functions para o self-hosted"

  local backup_root="$EDGE_BACKUP_DIR/$RUN_ID"
  sudo mkdir -p "$backup_root"

  while IFS= read -r -d '' entry; do
    local name
    name="$(basename "$entry")"

    [[ "$name" == "main" ]] && {
      warn "diretório reservado 'main' ignorado."
      continue
    }

    local dest="$FUNCTIONS_VOLUME/$name"

    if sudo test -e "$dest"; then
      sudo cp -a "$dest" "$backup_root/$name"
    fi

    sudo rm -rf "$dest"
    sudo cp -a "$entry" "$dest"

    echo "Copiado: $name"

  done < <(
    find "$functions_dir" -mindepth 1 -maxdepth 1 -print0
  )

  log "Reiniciando Edge Runtime"

  sudo docker restart "$EDGE_CONTAINER" >/dev/null
  sleep 2

  local status
  status="$(sudo docker inspect "$EDGE_CONTAINER" --format '{{.State.Status}}')"

  echo "Edge Runtime: $status"
  [[ "$status" == "running" ]] || die "Edge Runtime não voltou para running."

  log "Validando funções no volume"

  while IFS= read -r fn; do
    [[ -n "$fn" ]] || continue

    if sudo test -f "$FUNCTIONS_VOLUME/$fn/index.ts"; then
      echo "$fn: OK"
    else
      die "função '$fn' não possui index.ts no destino."
    fi
  done < "$SOURCE_FUNCTIONS_FILE"

  echo
  echo "Observação: import maps/deno.json e valores de secrets customizados"
  echo "não são reconstruídos automaticamente pelo download da plataforma."
}

generate_report() {
  CURRENT_PHASE="report"
  log "Gerando relatório origem x destino"

  local old_urls_remaining
  old_urls_remaining="$(count_remaining_old_storage_urls 2>/dev/null || echo '?')"

  {
    echo "============================================================"
    echo "SUPABASE CLOUD -> SELF-HOSTED"
    echo "RELATÓRIO DE MIGRAÇÃO"
    echo "============================================================"
    echo
    echo "Data:             $(date -Is)"
    echo "Projeto:          $MIGRATION_NAME"
    echo "Project ref:      $SOURCE_PROJECT_REF"
    echo "Origem:           $SOURCE_SUPABASE_URL"
    echo "Destino:          $DEST_SUPABASE_URL"
    echo "DB container:     $DB_CONTAINER"
    [[ -n "$EDGE_CONTAINER" ]] && echo "Edge container:   $EDGE_CONTAINER"
    echo
    echo "Etapas:"
    echo "  Ordem:          Banco -> Storage -> Rewrite URLs -> Edge Functions"
    echo "  Banco:          $MIGRATE_DB"
    echo "  Storage:        $MIGRATE_STORAGE"
    echo "  Edge Functions: $MIGRATE_FUNCTIONS"
    echo "  Rewrite URLs:   $REWRITE_STORAGE_URLS (text + json/jsonb)"
    echo
    echo "Linhas com URL atualizadas:    $URL_REWRITE_ROWS"
    echo "Referências atualizadas:       $URL_REWRITE_REFERENCES"
    echo "Referências antigas restantes: $old_urls_remaining"
    echo

    echo "------------------------------------------------------------"
    echo "BANCO / AUTH"
    echo "------------------------------------------------------------"

    local counts_file="$SOURCE_TABLE_COUNTS_FILE"

    if [[ -s "$counts_file" ]]; then
      printf '%-42s %12s %12s %s\n' "Tabela" "Origem" "Destino" "Status"

      while IFS=$'\t' read -r target source_count; do
        [[ -n "$target" ]] || continue

        local dest_count
        local status

        dest_count="$(count_dest_table "$target" 2>/dev/null || echo "ERROR")"

        if [[ "$dest_count" == "$source_count" ]]; then
          status="OK"
        else
          status="DIVERGENTE"
        fi

        printf '%-42s %12s %12s %s\n' "$target" "$source_count" "$dest_count" "$status"
      done < "$counts_file"
    else
      echo "Contagens da origem indisponíveis."
    fi

    echo
    echo "------------------------------------------------------------"
    echo "STORAGE"
    echo "------------------------------------------------------------"

    if [[ -s "$SOURCE_STORAGE_COUNTS_FILE" ]]; then
      printf '%-35s %12s %12s %s\n' "Bucket" "Origem" "Destino" "Status"

      while IFS=$'\t' read -r bucket source_count; do
        [[ -n "$bucket" ]] || continue

        local dest_count
        local status="DIVERGENTE"

        dest_count="$(
          dest_psql \
            -At \
            -v bucket="$bucket" \
            -c "
              SELECT count(*)
              FROM storage.objects
              WHERE bucket_id = :'bucket';
            " 2>/dev/null || echo "ERROR"
        )"

        [[ "$dest_count" == "$source_count" ]] && status="OK"

        printf '%-35s %12s %12s %s\n' "$bucket" "$source_count" "$dest_count" "$status"
      done < "$SOURCE_STORAGE_COUNTS_FILE"
    else
      echo "Contagens de Storage da origem indisponíveis."
    fi

    echo
    echo "------------------------------------------------------------"
    echo "EDGE FUNCTIONS"
    echo "------------------------------------------------------------"

    if [[ -s "$SOURCE_FUNCTIONS_FILE" ]]; then
      while IFS= read -r fn; do
        [[ -n "$fn" ]] || continue

        if [[ -n "$FUNCTIONS_VOLUME" ]] && sudo test -f "$FUNCTIONS_VOLUME/$fn/index.ts"; then
          echo "$fn: OK"
        else
          echo "$fn: AUSENTE"
        fi
      done < "$SOURCE_FUNCTIONS_FILE"
    else
      echo "Nenhuma função registrada ou funções não analisadas."
    fi

    echo
    echo "Variáveis referenciadas pelas Edge Functions:"

    if [[ -s "$EDGE_ENV_VARS_FILE" && -n "$EDGE_CONTAINER" ]]; then
      while IFS= read -r var; do
        [[ -n "$var" ]] || continue

        if sudo docker exec "$EDGE_CONTAINER" sh -c 'printenv "$1" >/dev/null 2>&1' sh "$var"; then
          echo "  $var: OK"
        else
          echo "  $var: AUSENTE NO RUNTIME"
        fi
      done < "$EDGE_ENV_VARS_FILE"
    else
      echo "  nenhuma detectada / não analisado"
    fi

    echo
    echo "ATENÇÃO:"
    echo "  - valores de secrets customizados não são baixáveis pelo script."
    echo "  - import maps e deno.json podem exigir migração manual."
    echo "  - SMTP, OAuth e demais configurações de Auth são por ambiente."
    echo
    echo "Log completo:"
    echo "  $LOG_FILE"

  } > "$REPORT_FILE"

  cat "$REPORT_FILE"

  echo
  echo "Relatório salvo em:"
  echo "  $REPORT_FILE"
}

log "Verificando pré-requisitos"

for cmd in curl jq file python3 docker supabase sed grep awk; do
  require_cmd "$cmd"
done

find_db_container
warn_env_permissions

echo "Projeto Cloud:       $SOURCE_PROJECT_REF"
echo "Destino:             $DEST_SUPABASE_URL"
echo "DB container:        $DB_CONTAINER"
echo "Migra banco:         $MIGRATE_DB"
if [[ -n "$SOURCE_DB_URL" ]]; then
  echo "Origem DB:            SOURCE_DB_URL (direta)"
else
  echo "Origem DB:            projeto linked"
fi
echo "Migra Storage:       $MIGRATE_STORAGE"
echo "Migra Functions:     $MIGRATE_FUNCTIONS"
echo "Reescreve URLs:      $REWRITE_STORAGE_URLS"
echo "Permite destino usado:$ALLOW_NONEMPTY_DESTINATION"
echo "Diretório:           $WORK_DIR"
echo "Log:                 $LOG_FILE"

check_endpoint "Supabase Cloud" "$SOURCE_SUPABASE_URL" "$SOURCE_SERVICE_ROLE_KEY"
check_endpoint "Supabase self-hosted" "$DEST_SUPABASE_URL" "$DEST_SERVICE_ROLE_KEY"

log "Preparando Supabase CLI"

cd "$WORK_DIR"

if [[ ! -f "supabase/config.toml" ]]; then
  supabase init
fi

NEEDS_SUPABASE_LINK=0

# Storage/Functions usam o contexto do projeto linked. O banco também usa linked
# quando SOURCE_DB_URL não foi fornecida.
if [[ "$MIGRATE_STORAGE" == "1" || "$MIGRATE_FUNCTIONS" == "1" ]]; then
  NEEDS_SUPABASE_LINK=1
fi

if [[ "$MIGRATE_DB" == "1" && -z "$SOURCE_DB_URL" ]]; then
  NEEDS_SUPABASE_LINK=1
fi

if [[ "$NEEDS_SUPABASE_LINK" == "1" ]]; then
  supabase link --project-ref "$SOURCE_PROJECT_REF"
else
  log "supabase link dispensado; banco usará SOURCE_DB_URL"
fi

echo
echo "========================================"
echo " MIGRAÇÃO SUPABASE v5"
echo "========================================"

# Banco primeiro. Se schema/dados falharem, nada é enviado ao Storage nem às Functions.
if [[ "$MIGRATE_DB" == "1" ]]; then
  migrate_db
else
  log "Banco ignorado (MIGRATE_DB=0)"
fi

if [[ "$MIGRATE_STORAGE" == "1" ]]; then
  migrate_storage
else
  log "Storage ignorado (MIGRATE_STORAGE=0)"
fi

# Reescreve URLs somente depois do banco e, quando habilitado, do Storage concluírem.
if [[ "$REWRITE_STORAGE_URLS" == "1" && ( "$MIGRATE_DB" == "1" || "$CLI_REWRITE_URLS_ONLY" == "1" ) ]]; then
  rewrite_storage_urls
fi

if [[ "$MIGRATE_FUNCTIONS" == "1" ]]; then
  migrate_functions
else
  log "Edge Functions ignoradas (MIGRATE_FUNCTIONS=0)"
fi

generate_report

echo
echo "========================================"
echo " MIGRAÇÃO FINALIZADA"
echo "========================================"
echo "Log:"
echo "  $LOG_FILE"
echo "Relatório:"
echo "  $REPORT_FILE"

echo
echo "Depois da migração:"
echo "  unset SOURCE_SERVICE_ROLE_KEY"
echo "  unset DEST_SERVICE_ROLE_KEY"
echo "  unset SOURCE_DB_URL"
echo "  unset SUPABASE_ACCESS_TOKEN"
