---
name: agents-update
description: Optimize AGENTS.md by reducing noise and moving detailed content to agents-docs/. Keeps AGENTS.md under 140 lines as a quick reference hub while preserving all content in dedicated documentation files.
version: 0.1.1
author: swarm-optimization-team
tags: [agents, documentation, optimization, swarm]
---

# agents-update Skill

Optimize AGENTS.md to be a concise coordination hub (<140 lines) by moving detailed content to appropriate `agents-docs/` subdirectories.

## When to Use

- AGENTS.md exceeds 140 lines and needs noise reduction
- Content has grown too detailed for quick reference
- Need to reorganize documentation for better discoverability
- Adding new major sections that would bloat AGENTS.md

## Core Rule

**AGENTS.md ≤ 140 LOC**: Quick reference + links only  
**agents-docs/**: Complete instructions with examples

## Section Mapping

| AGENTS.md Section              | Target agents-docs/ File                           | Priority |
| ------------------------------ | -------------------------------------------------- | -------- |
| Production Readiness Checklist | `agents-docs/coordination/production-readiness.md` | High     |
| Tracking Warnings and Issues   | `agents-docs/coordination/production-readiness.md` | High     |
| Code Quality Standards         | `agents-docs/quality-standards.md`                 | High     |
| URL Handling Rules             | `agents-docs/url-handling.md`                      | Critical |
| Referral System Features       | `agents-docs/features/referral-system.md`          | Medium   |
| Input Methods Analysis         | `agents-docs/features/input-methods.md`            | Medium   |
| Handoff Coordination           | `agents-docs/coordination/handoff-protocol.md`     | High     |
| Swarm Coordination             | `agents-docs/coordination/swarm-patterns.md`       | High     |
| Web Research                   | `agents-docs/features/web-research.md`             | Medium   |
| Project Structure              | `agents-docs/PROJECT_STRUCTURE.md`                 | High     |
| State Management               | `agents-docs/coordination/state-management.md`     | Medium   |
| Quality Gates                  | `agents-docs/quality-gates.md`                     | High     |
| Next Steps & References        | Keep condensed in AGENTS.md                        | -        |

## Workflow

### 1. Read Current State

```bash
# Get current line count
wc -l AGENTS.md

# Check if optimization needed (>140 lines)
if [ $(wc -l < AGENTS.md) -gt 140 ]; then
  echo "Optimization needed"
fi
```

### 2. Plan Migration

Identify sections to migrate based on mapping table above.

### 3. Execute Swarm Optimization

Use parallel agents to migrate content simultaneously:

```bash
# Load parallel execution skill
skill parallel-execution

# Launch swarm for each section group
```

### 4. Validate Results

```bash
# Check line count
wc -l AGENTS.md  # Must be ≤140

# Verify all destinations exist
ls -la agents-docs/coordination/
ls -la agents-docs/features/

# Check for broken references
grep -r "AGENTS.md" agents-docs/ | head -20
```

## Implementation Patterns

### Pattern 1: Single Section Migration

For simple cases with 1-2 sections to move:

1. Read AGENTS.md section
2. Create destination file with moved content
3. Replace section in AGENTS.md with brief summary + link
4. Update any cross-references

### Pattern 2: Swarm Parallel Migration

For complex optimization with 5+ sections:

```
Parent Agent
├─→ Agent 1: Coordination & Checklists → agents-docs/coordination/
├─→ Agent 2: Quality Standards → agents-docs/quality-standards.md
├─→ Agent 3: URL Handling → agents-docs/url-handling.md
├─→ Agent 4: Referral System → agents-docs/features/
├─→ Agent 5: Handoff & Swarm → agents-docs/coordination/
├─→ Agent 6: Web Research → agents-docs/features/
└─→ Agent 7: Structure & State → agents-docs/ structure files
```

Each agent:

1. Reads their assigned section from AGENTS.md
2. Creates/updates destination file with full content
3. Returns confirmation with line counts

### Pattern 3: Content Preservation Rules

When moving content, always:

- ✓ Include complete examples
- ✓ Preserve code blocks
- ✓ Keep tables intact
- ✓ Maintain cross-references
- ✓ Add standalone usability (clear headers, context)
- ✗ Never delete without moving
- ✗ Never truncate examples
- ✗ Never lose code samples

## Destination File Templates

### Coordination File Template

```markdown
# [Title]

**Version: 0.1.1  
**Status**: Active  
**Purpose\*\*: [One-line description]

## Overview

[Brief context about what this documents]

## Content

[Moved content from AGENTS.md with full examples]

## Related Documentation

- [AGENTS.md](../AGENTS.md) - Master coordination hub
- [Other related files]
```

### Feature File Template

````markdown
# [Feature Name]

**Version: 0.1.1  
**Status**: [Active/Planned/Deprecated]  
**Last Updated\*\*: [ISO date]

## Overview

[Feature description]

## Details

[Moved content with examples]

## Usage

```bash
# Example commands
```
````

## API Reference

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| ...      | ...    | ...         |

## Related Documentation

- [Link to related docs]

````

## Quality Gates

After optimization, verify:

- [ ] `wc -l AGENTS.md` ≤ 140
- [ ] All migrated sections have destination files
- [ ] Destination files have code examples
- [ ] Cross-references are valid (no 404s)
- [ ] AGENTS.md still functional as quick reference
- [ ] No content was lost in migration

## Error Handling

### AGENTS.md Still >140 Lines

**Cause**: Not enough content migrated
**Solution**: Identify remaining verbose sections, migrate more

### Broken Cross-References

**Cause**: Links not updated after migration
**Solution**: Search for old anchors, update to new file paths

### Lost Content

**Cause**: Agent error during migration
**Solution**: Compare original AGENTS.md with backups, restore missing content

## Verification Commands

```bash
# Line count check
echo "AGENTS.md lines: $(wc -l < AGENTS.md)"

# Destination files check
find agents-docs/ -name "*.md" -type f | wc -l

# Cross-reference check
grep -h "\.\./AGENTS.md" agents-docs/**/*.md 2>/dev/null | wc -l

# Content completeness (search for key phrases)
grep -c "Quick Start" AGENTS.md
grep -c "## " AGENTS.md  # Should have fewer sections
````

## Best Practices

1. **Always backup** AGENTS.md before optimization
2. **Use swarm** for complex migrations (>3 sections)
3. **Verify each section** after migration
4. **Update references** in other files pointing to old sections
5. **Test AGENTS.md** as quick reference - can new team member get oriented?

## References

- [Section Mapping](references/section-mapping.md) - Complete mapping table
- [Migration Examples](references/migration-examples.md) - Before/after examples
- [Swarm Config](references/swarm-config.json) - Agent assignments for parallel execution
