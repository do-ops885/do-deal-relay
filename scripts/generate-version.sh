#!/bin/bash
# Generate worker/version.ts from VERSION file (single source of truth)
# This script runs before build/dev to inject the version into the worker
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$ROOT_DIR/VERSION"
OUTPUT_FILE="$ROOT_DIR/worker/version.ts"

if [ ! -f "$VERSION_FILE" ]; then
  echo "0.0.0-dev" > "$VERSION_FILE"
fi

VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')

cat > "$OUTPUT_FILE" << EOF
// Auto-generated from VERSION file - DO NOT EDIT
// Single source of truth: /VERSION
export const VERSION = "$VERSION";
EOF

echo "Generated worker/version.ts with version $VERSION"
