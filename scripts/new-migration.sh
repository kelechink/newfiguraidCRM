#!/usr/bin/env bash
# Create a migration from the schema diff without an interactive prompt.
# Usage: scripts/new-migration.sh <name>   (needs SHADOW_DATABASE_URL: an empty scratch database)
set -euo pipefail
name="${1:?migration name}"
shadow="${SHADOW_DATABASE_URL:-postgresql://figuraid:figuraid@localhost:5432/figuraid_test}"
dir="prisma/schema/migrations/$(date -u +%Y%m%d%H%M%S)_${name}"
mkdir -p "$dir"
npx prisma migrate diff --from-migrations prisma/schema/migrations --to-schema-datamodel prisma/schema \
  --shadow-database-url "$shadow" --script > "$dir/migration.sql"
if ! grep -qv '^--' "$dir/migration.sql" || [ ! -s "$dir/migration.sql" ]; then
  rm -rf "$dir"; echo "No schema changes."; exit 0
fi
echo "Created $dir"
