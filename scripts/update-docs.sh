#!/usr/bin/env bash
# Auto-update version strings in all documentation files
# Reads VERSION file and propagates to all docs
# Usage:
#   bash scripts/update-docs.sh          # Update version strings in docs
#   bash scripts/update-docs.sh --check  # Check for version drift in docs (exit 1 if drift)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

CHECK_MODE=false
if [ "${1:-}" = "--check" ]; then
  CHECK_MODE=true
fi

VERSION_FILE="VERSION"
if [ ! -f "$VERSION_FILE" ]; then
  echo "Error: VERSION file not found"
  exit 1
fi

VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
DEPLOY_COUNT=$(git tag -l 'v*' 2>/dev/null | wc -l | tr -d '[:space:]')

# Build list of documentation files to track
DOCS_FILES=(
  "README.md"
  "AGENTS.md"
)

while IFS= read -r f; do
  if [ -n "$f" ]; then
    DOCS_FILES+=("$f")
  fi
done < <(find docs agents-docs -type f \( -name "*.md" -o -name "*.yaml" -o -name "*.yml" -o -name "state.json" \) \
  ! -path "*/handoff-log*" \
  ! -path "*/ai-act-log*" \
  ! -path "*/lessons.jsonl" \
  ! -path "*/swarm-config*" \
  ! -path "*/handoffs/README.md" | sort)

if [ "$CHECK_MODE" = true ]; then
  echo "Checking docs for version drift against $VERSION..."
  DRIFT_COUNT=0
  TMP_FILE=$(mktemp)

  for file in "${DOCS_FILES[@]}"; do
    if [ -f "$file" ]; then
      sed -E \
        -e "s/\*\*Version\*\*: v?[0-9]+\.[0-9]+\.[0-9]+/\*\*Version\*\*: $VERSION/g" \
        -e "s/\*\*Version: v?[0-9]+\.[0-9]+\.[0-9]+/\*\*Version\*\*: $VERSION/g" \
        -e "s/\*\*Server Version\*\*: [0-9]+\.[0-9]+\.[0-9]+/\*\*Server Version\*\*: $VERSION/g" \
        -e "s/\*\*Current Version:\*\* [0-9]+\.[0-9]+\.[0-9]+/\*\*Current Version:\*\* $VERSION/g" \
        -e "s/# (.*) \(v[0-9]+\.[0-9]+\.[0-9]+\)/# \1 (v$VERSION)/g" \
        -e "s/version-[0-9]+\.[0-9]+\.[0-9]*/version-$VERSION/g" \
        -e "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]*\"/\"version\": \"$VERSION\"/g" \
        -e "s/^  version: [0-9]+\.[0-9]+\.[0-9]*/  version: $VERSION/g" \
        "$file" > "$TMP_FILE"

      if ! cmp -s "$file" "$TMP_FILE"; then
        echo "  Version drift in: $file"
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
      fi
    fi
  done
  rm -f "$TMP_FILE"

  if [ $DRIFT_COUNT -gt 0 ]; then
    echo "Error: $DRIFT_COUNT documentation file(s) have version drift (expected $VERSION)."
    echo "Run 'npm run docs:update' or 'bash scripts/update-docs.sh' to fix."
    exit 1
  else
    echo "Docs version check passed. All files match version $VERSION."
    exit 0
  fi
fi

echo "Updating docs to version $VERSION ($DEPLOY_COUNT deploys)..."
UPDATED=0

for file in "${DOCS_FILES[@]}"; do
  if [ -f "$file" ]; then
    TMP_FILE=$(mktemp)
    sed -E \
      -e "s/\*\*Version\*\*: v?[0-9]+\.[0-9]+\.[0-9]+/\*\*Version\*\*: $VERSION/g" \
      -e "s/\*\*Version: v?[0-9]+\.[0-9]+\.[0-9]+/\*\*Version\*\*: $VERSION/g" \
      -e "s/\*\*Server Version\*\*: [0-9]+\.[0-9]+\.[0-9]+/\*\*Server Version\*\*: $VERSION/g" \
      -e "s/\*\*Current Version:\*\* [0-9]+\.[0-9]+\.[0-9]+/\*\*Current Version:\*\* $VERSION/g" \
      -e "s/# (.*) \(v[0-9]+\.[0-9]+\.[0-9]+\)/# \1 (v$VERSION)/g" \
      -e "s/version-[0-9]+\.[0-9]+\.[0-9]*/version-$VERSION/g" \
      -e "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]*\"/\"version\": \"$VERSION\"/g" \
      -e "s/^  version: [0-9]+\.[0-9]+\.[0-9]*/  version: $VERSION/g" \
      "$file" > "$TMP_FILE"

    if ! cmp -s "$file" "$TMP_FILE"; then
      mv "$TMP_FILE" "$file"
      echo "  Updated: $file"
      UPDATED=$((UPDATED + 1))
    else
      rm -f "$TMP_FILE"
    fi
  fi
done

echo "Updated $UPDATED files to version $VERSION"
