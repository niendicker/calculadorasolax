#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
validation_container="calculadora-ci-sts-validation-$$"
docker run -d --rm --network none --name "$validation_container" -e POSTGRES_PASSWORD=disposable-validation postgres:16 >/dev/null
trap 'docker rm -f "$validation_container" >/dev/null' EXIT
for attempt in {1..30}; do
 if docker exec "$validation_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break;fi
 sleep 1
done
docker exec -e PGPASSWORD=disposable-validation -i "$validation_container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < scripts/fixtures/ci-sts/base.sql
docker exec -e PGPASSWORD=disposable-validation -i "$validation_container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/0097_ci_modular_compatibility.sql
docker exec -e PGPASSWORD=disposable-validation -i "$validation_container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/0098_ci_backup_sts.sql
docker exec -e PGPASSWORD=disposable-validation -i "$validation_container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < scripts/fixtures/ci-sts/check.sql
