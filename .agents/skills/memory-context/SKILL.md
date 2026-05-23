# memory-context

## Purpose
Provides long-term knowledge retention and context management for AI agents. Maintains a searchable memory bank of patterns, decisions, and domain knowledge that persists across sessions and tasks.

## When to Use
- Starting work on a recurring problem type
- Needing to recall architectural decisions from weeks/months ago
- Onboarding new agents or team members
- Building cumulative knowledge about domain-specific patterns

## Rules

### Memory Categories

1. **Architectural Memory** (`memory/architecture/`)
   - System design decisions
   - Component interaction patterns
   - Technology choices and rationale

2. **Domain Memory** (`memory/domain/`)
   - Business rules and constraints
   - Deal discovery heuristics
   - Compliance requirements (EU AI Act, etc.)

3. **Pattern Memory** (`memory/patterns/`)
   - Reusable code patterns
   - Anti-patterns to avoid
   - Refactoring strategies

4. **Operational Memory** (`memory/operations/`)
   - Deployment procedures
   - Monitoring and alerting setup
   - Incident response playbooks

5. **Tool Memory** (`memory/tools/`)
   - Tool configurations
   - Workflow automations
   - Script usage examples

### Memory Entry Format
```markdown
# [Memory Title]

**Category**: [architecture|domain|pattern|operations|tools]
**Created**: YYYY-MM-DD
**Last Updated**: YYYY-MM-DD
**Related Skills**: [skill1, skill2]
**Confidence**: [high|medium|low]

## Summary
One-paragraph overview

## Details
In-depth explanation with examples

## Usage Guidelines
When and how to apply this knowledge

## Examples
Code snippets, configurations, or scenarios

## Related Memories
Links to connected memory entries

## Source
Origin of this knowledge (ADR, lesson learned, external reference)
```

### Retention Policy
- **Keep Indefinitely**: Architectural decisions, core patterns, compliance rules
- **Review Quarterly**: Operational procedures, tool configurations
- **Archive After 1 Year**: Task-specific learnings superseded by newer patterns

## Scripts

### search-memory.sh
```bash
#!/usr/bin/env bash
# Searches memory bank for relevant context

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <search-term> [category]"
    echo "Categories: architecture, domain, patterns, operations, tools"
    exit 1
fi

SEARCH_TERM="$1"
CATEGORY="${2:-}"

MEMORY_DIR="memory"

if [ ! -d "$MEMORY_DIR" ]; then
    echo "⚠️  Memory directory not found. Run init-memory.sh first."
    exit 1
fi

echo "🔍 Searching memory for: $SEARCH_TERM"
[ -n "$CATEGORY" ] && echo "📁 Category filter: $CATEGORY"
echo ""

if [ -n "$CATEGORY" ]; then
    SEARCH_PATH="$MEMORY_DIR/$CATEGORY"
    if [ ! -d "$SEARCH_PATH" ]; then
        echo "❌ Category '$CATEGORY' not found."
        exit 1
    fi
    grep -ril "$SEARCH_TERM" "$SEARCH_PATH" 2>/dev/null || echo "No matches found."
else
    grep -ril "$SEARCH_TERM" "$MEMORY_DIR" 2>/dev/null || echo "No matches found."
fi
```

### init-memory.sh
```bash
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
    cat > "memory/$category/.index.md" << EOF
# $category Memory Index

This directory contains memory entries for the $category category.

## Entries
<!-- Auto-populated as memories are added -->

## Quick Reference
<!-- Common patterns and decisions -->
EOF
done

echo "✅ Memory structure initialized:"
tree memory 2>/dev/null || find memory -type d | head -20
```

### add-memory.sh
```bash
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
    echo "Run: ./scripts/init-memory.sh"
    exit 1
fi

cat > "$MEMORY_FILE" << EOF
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
EOF

echo "📝 Memory created: $MEMORY_FILE"
echo "✏️  Edit the file to add content"
```

## Integration Points

### With Learn Skill
- Lessons captured via `learn` skill can be promoted to memory when they prove reusable
- Memory entries link back to source lessons for traceability

### With GOAP Workflow
- **Phase 1 (Analyze)**: Search memory for relevant patterns before starting
- **Phase 4 (Synthesize)**: Add new discoveries to memory if broadly applicable

### With AGENTS.md
Memory complements AGENTS.md:
- AGENTS.md: Active working context, current constraints
- Memory: Long-term knowledge repository

## Querying Memory

```bash
# Search all memory
./memory/scripts/search-memory.sh "circuit breaker"

# Search specific category
./memory/scripts/search-memory.sh "validation" domain

# List recent entries
ls -lt memory/*/*.md | head -10
```

## Anti-Patterns

❌ **Duplicate storage**: Don't store in both memory and docs without cross-reference
❌ **Stale memories**: Update or archive when information becomes outdated
❌ **Over-categorization**: Don't create too many subcategories prematurely
❌ **Write-only memory**: Regularly query and use stored knowledge

## Related Skills
- `learn` - Source of many memory entries
- `self-learning-feedback` - Uses memory for pattern recognition
- `goap-agent` - Consults memory during planning
- `task-decomposition` - References pattern memory

## Version
1.0.0
