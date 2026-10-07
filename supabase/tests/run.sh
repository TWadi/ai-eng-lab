#!/usr/bin/env bash
# Replays every migration on a fresh database, then runs the SQL tests.
# Usage: PSQL="psql -h localhost -p 5432 -U postgres" supabase/tests/run.sh
# (Locally with Docker: PSQL="docker exec -i arena-pg psql -U postgres" supabase/tests/run.sh)
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=${PSQL:-psql -U postgres}
DB=${DB:-arena_test}

$PSQL -d postgres -q -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB" >/dev/null
run() { $PSQL -d "$DB" -q -v ON_ERROR_STOP=1 --no-psqlrc -X < "$1"; }

run supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do
  run "$f" >/dev/null || { echo "Migration failed: $f"; exit 1; }
done
echo "Applied $(ls supabase/migrations/*.sql | wc -l) migrations."

shopt -s nullglob
run supabase/tests/helpers.sql >/dev/null
status=0
for t in supabase/tests/[1-9]*.sql; do
  if run "$t" >/dev/null; then echo "pass  $(basename "$t")"; else echo "FAIL  $(basename "$t")"; status=1; fi
done
exit $status
