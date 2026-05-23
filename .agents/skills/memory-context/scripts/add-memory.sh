#!/usr/bin/env bash
# Adds a new memory entry

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"

if [ $# -lt 2 ]; then
    echo "Usage: $0 <category> <title>"
    echo "Categories: architecture, domain, patterns, operations, tools"
    exit 1
fi

CATEGORY="$1"
TITLE="$2"
DATE=$(date +%Y-%m-%d)
SLUG=$(echo "$TITLE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g')
MEMORY_FILE="memory/$CATEGORY/${DATE}-${SLUG}.md"

if [ ! -d "memory/$CATEGORY" ]; then
    echo "❌ Category '$CATEGORY' does not exist."
    echo "Run: ./agents/skills/memory-context/scripts/init-memory.sh"
    exit 1
fi

cat > "$MEMORY_FILE" << MEMORY_EOF
# $TITLE

**Category**: $CATEGORY
**Created**: ${DATE}
**Last Updated**: ${DATE}
**Related Skills**: []
**Confidence**: medium

## Summary
<!-- One-paragraph overview -->

## Details
<!-- In-depth explanation with examples -->

## Usage Guidelines
<!-- When and how to apply this knowledge -->

## Examples
<!-- Code snippets, configurations, or scenarios -->

## Related Memories
<!-- Links to connected memory entries -->

## Source
<!-- Origin of this knowledge (ADR, lesson learned, external reference) -->
MEMORY_EOF

echo "📝 Memory created: $MEMORY_FILE"
echo "✏️  Edit the file to add content"
