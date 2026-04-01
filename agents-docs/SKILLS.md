# Skill Authoring Guide

**System**: Deal Discovery Relay Worker
**Version**: 1.0.0
**Last Updated**: 2026-04-01

This guide covers creating, organizing, and maintaining skills for the agent system. Skills provide domain-specific capabilities accessible via the `skill` command.

## What is a Skill?

A skill is a self-contained bundle of knowledge, patterns, and workflows that agents can load on-demand. Skills follow a **progressive disclosure** model—core concepts first, advanced patterns available when needed.

## Skill Structure

```
.agents/skills/<skill-name>/
├── SKILL.md              # Main documentation (required)
├── QUICKSTART.md         # Fast onboarding (optional)
├── <pattern>.md          # Deep-dive topics (optional)
└── examples/             # Code samples (optional)
    └── example.ts
```

### SKILL.md Format

Every skill MUST have a `SKILL.md` with this frontmatter:

```yaml
---
name: skill-name
description: One-line description of what this skill does
version: 1.0.0
author: agent
tags: [tag1, tag2, tag3]
---
```

## Progressive Disclosure Levels

Skills follow a 3-level disclosure pattern:

### Level 1: Quick Start (Always Visible)

Immediate actionable commands. 80% of use cases covered here.

````markdown
## Quick Start

```bash
# Most common command
skill <name>

# Alternative patterns
skill <name> --flag
```
````

````

### Level 2: Core Concepts (Main Body)

Essential knowledge for effective use. 95% of use cases covered.

```markdown
## Core Concepts

### Concept A
Brief explanation with example.

### Concept B
Brief explanation with example.
````

### Level 3: Deep Dives (Linked Documents)

Advanced patterns, edge cases, full API reference.

```markdown
## Advanced Topics

- [Parallel Workflows](./PARALLEL.md)
- [Error Handling Patterns](./ERRORS.md)
- [Performance Optimization](./PERF.md)
```

## Creating a New Skill

### Step 1: Create Directory Structure

```bash
mkdir -p .agents/skills/<skill-name>
touch .agents/skills/<skill-name>/SKILL.md
```

### Step 2: Write SKILL.md

````markdown
---
name: my-skill
description: Brief description of skill purpose
version: 1.0.0
author: agent
tags: [category, purpose]
---

# My Skill

One-paragraph overview of what this skill enables.

## Quick Start

```bash
# Primary command
skill my-skill

# Common variations
skill my-skill --option
```
````

## Core Concepts

### Concept One

Brief description with example:

```typescript
// Example code
const result = await doSomething();
```

### Concept Two

Brief description with example.

## Common Patterns

| Pattern   | Command                    | Use When    |
| --------- | -------------------------- | ----------- |
| Pattern A | `skill my-skill pattern-a` | Condition X |
| Pattern B | `skill my-skill pattern-b` | Condition Y |

## Error Handling

| Error   | Cause   | Solution   |
| ------- | ------- | ---------- |
| Error A | Cause A | Solution A |
| Error B | Cause B | Solution B |

## Advanced Topics

- [Deep Dive A](./A.md)
- [Deep Dive B](./B.md)

## Related Skills

- `related-skill-1` - Complements this skill for X
- `related-skill-2` - Alternative approach for Y

````

### Step 3: Add Deep Dives (Optional)

For complex skills, create focused documents:

```bash
touch .agents/skills/<skill-name>/ADVANCED_TOPIC.md
````

### Step 4: Update Skills Index

Add to `.agents/skills/README.md`:

```markdown
| Skill           | Description       | Impact             |
| --------------- | ----------------- | ------------------ |
| `<skill-name>/` | Brief description | **Level** - Reason |
```

## Skill Categories

### Coordination Skills

Multi-agent orchestration patterns:

- `agent-coordination/` - Parallel, sequential, swarm, hybrid, iterative
- `goap-agent/` - Goal-oriented planning
- `task-decomposition/` - Task breakdown
- `parallel-execution/` - Parallel workflows

### Quality Skills

Validation and reliability:

- `validation-gates/` - 9-gate validation pipeline
- `circuit-breaker/` - Failure isolation
- `distributed-locking/` - Concurrency control
- `trust-model/` - Trust score calculation

### Platform Skills

Cloudflare-specific capabilities:

- `cloudflare/` - Platform overview (external)
- `agents-sdk/` - Stateful agents (external)
- `durable-objects/` - State coordination (external)
- `wrangler/` - Deployment (external)

### Utility Skills

Cross-cutting concerns:

- `structured-logging/` - Observability
- `crypto-utils/` - Hashing/encryption
- `metrics-pipeline/` - Analytics
- `expiration-manager/` - TTL handling

## Documentation Patterns

### Command Reference Table

```markdown
| Command           | Description | Example                  |
| ----------------- | ----------- | ------------------------ |
| `skill name cmd1` | Does X      | `skill name cmd1 --flag` |
| `skill name cmd2` | Does Y      | `skill name cmd2 arg`    |
```

### Decision Matrix

```markdown
| Scenario    | Recommended | Alternative |
| ----------- | ----------- | ----------- |
| Condition A | Pattern 1   | Pattern 2   |
| Condition B | Pattern 3   | Pattern 4   |
```

### Troubleshooting Table

```markdown
| Symptom   | Cause   | Solution   |
| --------- | ------- | ---------- |
| Symptom A | Cause A | Solution A |
| Symptom B | Cause B | Solution B |
```

## Best Practices

### 1. Start Simple

- Begin with Quick Start section
- Cover 80% of use cases in first 30 lines
- Link to advanced topics, don't include inline

### 2. Use Tables for Scanning

- Command references → tables
- Decision matrices → tables
- Error solutions → tables

### 3. Keep SKILL.md Under 300 Lines

```bash
# Check line count
wc -l .agents/skills/<name>/SKILL.md

# If >300 lines, split into linked documents
```

### 4. Include Runnable Examples

````markdown
## Quick Start

```bash
# This actually works
curl -X POST https://api.example.com/deals \
  -H "Content-Type: application/json" \
  -d '{"source": "test"}'
```
````

````

### 5. Cross-Reference Related Skills

```markdown
## Related Skills

- `skill-a` - Use for X before this skill
- `skill-b` - Use for Y after this skill
- `skill-c` - Alternative when Z
````

## Skill Registry

Maintain the skills registry in `.agents/skills/README.md`:

```markdown
# .agents/skills/README.md

## Skills Overview

| Skill      | Description   | Impact                |
| ---------- | ------------- | --------------------- |
| `skill-a/` | Description A | **Critical** - Reason |
| `skill-b/` | Description B | **High** - Reason     |
| `skill-c/` | Description C | **Medium** - Reason   |

## Quick Reference

### For Deal Discovery

- See `skill-a/SEQUENTIAL.md` - Pipeline flow
- See `skill-b/SWARM.md` - Multi-source analysis

## Usage

Load skills using:
```

skill skill-name

```

```

## Versioning

Skills follow semantic versioning:

- **Major**: Breaking changes to API
- **Minor**: New capabilities, backward compatible
- **Patch**: Bug fixes, documentation updates

Update `version` in frontmatter when releasing:

```yaml
---
version: 1.2.0 # Was 1.1.0, added new feature
---
```

## Testing Skills

Verify skill accessibility:

```bash
# Check skill loads
skill <name>

# Verify structure
ls -la .agents/skills/<name>/
cat .agents/skills/<name>/SKILL.md | head -30
```

## Migration Guide

When updating existing skills:

1. **Minor updates**: Edit in place, update patch version
2. **Major updates**: Create `SKILL_v2.md`, deprecate old version
3. **Renames**: Keep old name as symlink for one minor version

Example deprecation:

````markdown
---
name: old-skill
description: DEPRECATED: Use new-skill instead
version: 1.0.0
deprecated: true
replacement: new-skill
---

# ⚠️ DEPRECATED

This skill has been replaced by `new-skill`.
Please migrate:

```bash
# Old (deprecated)
skill old-skill command

# New (recommended)
skill new-skill command
```
````

````

## Examples

### Example 1: Simple Utility Skill

```markdown
---
name: crypto-utils
description: Cryptographic utilities for hashing and encryption
version: 1.0.0
author: agent
tags: [crypto, security, utils]
---

# Crypto Utils

Hashing and encryption utilities for deal data integrity.

## Quick Start

```bash
# Generate SHA-256 hash
skill crypto-utils hash --data "deal-content"

# Verify checksum
skill crypto-utils verify --hash <hash> --data <data>
````

## Core Concepts

### Hashing

Used for deduplication and snapshot verification:

```typescript
const hash = await sha256(dealData);
```

### Encryption

For sensitive deal metadata:

```typescript
const encrypted = await encrypt(data, key);
```

## Error Handling

| Error         | Cause              | Solution             |
| ------------- | ------------------ | -------------------- |
| Invalid hash  | Corrupted data     | Re-fetch from source |
| Hash mismatch | Tampering detected | Reject deal          |

````

### Example 2: Complex Coordination Skill

```markdown
---
name: agent-coordination
description: Coordinate multiple agents for software development
version: 2.0.0
author: agent
tags: [coordination, multi-agent, patterns]
---

# Agent Coordination

Coordinate multiple agents efficiently for complex development tasks.

## Quick Start

Choose your coordination strategy:

**Parallel** - Independent tasks → See [PARALLEL.md](PARALLEL.md)
**Sequential** - Dependent tasks → See [SEQUENTIAL.md](SEQUENTIAL.md)
**Swarm** - Multi-perspective analysis → See [SWARM.md](SWARM.md)

## Available Agents

| Agent | Best For |
|-------|----------|
| code-reviewer | Quality assessment |
| test-runner | Execute tests |
| feature-implementer | Build new capabilities |

## Basic Workflow

1. Choose strategy based on task structure
2. Select agents matching required capabilities
3. Execute with quality gates between phases
4. Validate outputs before proceeding
5. Synthesize results

## Advanced Topics

- [PARALLEL.md](./PARALLEL.md) - Parallel execution patterns
- [SEQUENTIAL.md](./SEQUENTIAL.md) - Dependency chains
- [SWARM.md](./SWARM.md) - Multi-perspective analysis
- [HYBRID.md](./HYBRID.md) - Mixed workflows
- [ITERATIVE.md](./ITERATIVE.md) - Progressive refinement
````

## Checklist

Before releasing a new skill:

- [ ] SKILL.md with proper frontmatter
- [ ] Quick Start section with runnable examples
- [ ] Core Concepts section
- [ ] Tables for commands/decisions/errors
- [ ] Line count < 300 (or split into linked docs)
- [ ] Related skills documented
- [ ] Version specified in frontmatter
- [ ] Added to `.agents/skills/README.md`
- [ ] Tested with `skill <name>` command

## Related Documentation

- [HARNESS.md](./HARNESS.md) - System overview
- [SUB-AGENTS.md](./SUB-AGENTS.md) - Context isolation
- `.agents/skills/README.md` - Skills registry
