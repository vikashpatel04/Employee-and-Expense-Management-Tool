#!/usr/bin/env bash
# Fails if a migration that already exists on BASE was modified, deleted or renamed,
# or if a new migration sorts before the newest one on BASE.
# Migrations on main are applied to the live database, so they're immutable:
# fix mistakes with a new migration.
#
# Usage: scripts/check-migrations.sh <base-sha> [head-sha]
set -euo pipefail

BASE="${1:-}"
HEAD="${2:-HEAD}"
DIR="supabase/migrations"

if [[ -z "$BASE" || "$BASE" =~ ^0+$ ]]; then
  echo "No base commit (first push); nothing to compare."
  exit 0
fi
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "::error::Base commit $BASE not found (force-push?). Can't verify migrations are unchanged."
  exit 1
fi

changed=$(git diff --name-only --diff-filter=MDR "$BASE" "$HEAD" -- "$DIR")
if [[ -n "$changed" ]]; then
  echo "::error::Applied migrations must not change. Add a new migration instead. Changed:"
  echo "$changed"
  exit 1
fi

newest_base=$(git ls-tree --name-only "$BASE" "$DIR/" | grep '\.sql$' | sort | tail -n 1 || true)
added=$(git diff --name-only --diff-filter=A "$BASE" "$HEAD" -- "$DIR" | grep '\.sql$' | sort || true)
for file in $added; do
  if [[ -n "$newest_base" && ! "$file" > "$newest_base" ]]; then
    echo "::error::$file sorts before the newest applied migration ($newest_base). Use a later timestamp."
    exit 1
  fi
done

echo "Migrations OK${added:+ (new: $(echo $added | xargs -n1 basename | tr '\n' ' '))}"
