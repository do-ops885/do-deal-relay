#!/usr/bin/env bash
# Initializes memory directory structure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"

echo "🏗️  Initializing memory context structure..."

mkdir -p memory/{architecture,domain,patterns,operations,tools}

# Create index files for each category
for category in architecture domain patterns operations tools; do
    cat > "memory/$category/.index.md" << INDEX_EOF
# $category Memory Index

This directory contains memory entries for the $category category.

## Entries
<!-- Auto-populated as memories are added -->

## Quick Reference
<!-- Common patterns and decisions -->
INDEX_EOF
done

echo "✅ Memory structure initialized:"
find memory -type d | sort
