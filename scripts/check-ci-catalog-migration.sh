#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
validation_container="calculadora-ci-catalog-validation-$$"
docker run -d --rm --network none --name "$validation_container" -e POSTGRES_PASSWORD=disposable-validation postgres:16 >/dev/null
trap 'docker rm -f "$validation_container" >/dev/null' EXIT
for attempt in {1..30}; do
 if docker exec "$validation_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
for fixture in scripts/fixtures/ci-sts/base.sql supabase/migrations/0097_ci_modular_compatibility.sql supabase/migrations/0098_ci_backup_sts.sql scripts/fixtures/ci-catalog/before.sql supabase/migrations/0099_ci_independent_catalogs.sql supabase/migrations/0100_ci_accessory_rules.sql supabase/migrations/0101_ci_integrated_parallel_limit.sql scripts/fixtures/ci-catalog/check.sql scripts/fixtures/ci-catalog/parallel-check.sql; do
 docker exec -e PGPASSWORD=disposable-validation -i "$validation_container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$fixture"
done
