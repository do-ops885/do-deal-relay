#!/usr/bin/env bash
# Auto-update version strings in all documentation files
# Reads VERSION file and propagates to all docs
# Runs as part of build/release process
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

VERSION_FILE="VERSION"
if [ ! -f "$VERSION_FILE" ]; then
  echo "Error: VERSION file not found"
  exit 1
fi

VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
DEPLOY_COUNT=$(git tag -l 'v*' 2>/dev/null | wc -l | tr -d '[:space:]')

echo "Updating docs to version $VERSION ($DEPLOY_COUNT deploys)..."

# Update version strings in tracked docs
DOCS_FILES=(
  "README.md"
  "AGENTS.md"
  "docs/AGENTS.md"
  "docs/DEPLOYMENT.md"
  "docs/QUICKSTART.md"
  "agents-docs/SYSTEM_REFERENCE.md"
)

UPDATED=0
for file in "${DOCS_FILES[@]}"; do
  if [ -f "$file" ]; then
    sed -i "s/\*\*Version\*\*: [0-9]\+\.[0-9]\+\.[0-9]*/\*\*Version\*\*: $VERSION/g" "$file"
    sed -i "s/version-[0-9]\+\.[0-9]\+\.[0-9]*/version-$VERSION/g" "$file"
    sed -i "s/\"version\": \"[0-9]\+\.[0-9]\+\.[0-9]*\"/\"version\": \"$VERSION\"/g" "$file"
    echo "  Updated: $file"
    UPDATED=$((UPDATED + 1))
  fi
done

echo "Updated $UPDATED files to version $VERSION"
