# Agent Harness System

**System**: Deal Discovery Relay Worker
**Version: 0.1.1
**Last Updated\*\*: 2026-04-01

The harness system orchestrates multiple AI agents, skills, and coordination patterns to enable autonomous deal discovery with the Cloudflare Workers infrastructure.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Harness                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Agents    │  │   Skills    │  │  Sub-Agents │         │
│  │  (9 types)  │  │  (30+)      │  │  (isolated) │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         └─────────────────┼─────────────────┘               │
│                           ↓                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Coordination Layer                         │   │
│  │  • Parallel execution   • Sequential chains          │   │
│  │  • Swarm analysis       • Hybrid workflows           │   │
│  │  • Iterative refinement • GOAP planning              │   │
│  └─────────────────────────┬───────────────────────────┘   │
│                            ↓                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Quality Gates (9 gates)                    │   │
│  │  Schema → Normalize → Dedupe → Validate → Score     │   │
│  │  → Stage → Publish → Verify → Finalize               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Model Context Protocol (MCP)

The MCP provides a standardized interface between AI models and external capabilities.

**Integration Points**:

- **Cloudflare Skills**: Platform-specific knowledge (Workers, KV, D1, R2)
- **Agent Coordination**: Multi-agent orchestration patterns
- **Validation Gates**: Quality enforcement at each pipeline stage

**Usage**:

```bash
# Load platform-specific skill
skill cloudflare
skill agents-sdk
skill durable-objects

# Load coordination patterns
skill agent-coordination
skill goap-agent
```

### 2. Skills System

Skills provide domain-specific capabilities accessible via the `skill` command.

**Local Skills** (`.agents/skills/`):

| Skill                  | Purpose                   | Use Case                     |
| ---------------------- | ------------------------- | ---------------------------- |
| `agent-coordination/`  | Multi-agent orchestration | Run 9-agent state machine    |
| `goap-agent/`          | Goal-oriented planning    | Complex deal analysis        |
| `task-decomposition/`  | Task breakdown            | Pipeline step implementation |
| `parallel-execution/`  | Parallel workflows        | Multi-source discovery       |
| `circuit-breaker/`     | Failure isolation         | External service calls       |
| `distributed-locking/` | Concurrency control       | Deal publishing              |
| `validation-gates/`    | Quality enforcement       | 9-gate validation            |
| `structured-logging/`  | Observability             | Pipeline tracing             |

**External Skills** (Platform):

| Skill                     | Purpose                 | Documentation                  |
| ------------------------- | ----------------------- | ------------------------------ |
| `cloudflare/`             | Workers, KV, D1, R2, AI | `skill cloudflare`             |
| `agents-sdk/`             | Stateful agents         | `skill agents-sdk`             |
| `durable-objects/`        | State coordination      | `skill durable-objects`        |
| `wrangler/`               | Deployment              | `skill wrangler`               |
| `workers-best-practices/` | Performance             | `skill workers-best-practices` |

### 3. Agent Types

The deal discovery system uses 9 specialized agents:

| Agent              | Responsibility    | Location                                |
| ------------------ | ----------------- | --------------------------------------- |
| `bootstrap-agent`  | Initial setup     | `agents-docs/agents/bootstrap-agent.md` |
| `storage-agent`    | KV/D1 storage     | `agents-docs/agents/storage-agent.md`   |
| `discovery-agent`  | Web scraping      | `agents-docs/agents/discovery-agent.md` |
| `validation-agent` | 9-gate checks     | `agents-docs/agents/scoring-agent.md`   |
| `scoring-agent`    | Trust/reward calc | `agents-docs/agents/scoring-agent.md`   |
| `publish-agent`    | Staging/prod      | `agents-docs/agents/publish-agent.md`   |
| `notify-agent`     | Alerts/webhooks   | `agents-docs/agents/notify-agent.md`    |
| `data-agent`       | Analytics/ML      | `agents-docs/agents/data-agent.md`      |
| `doc-agent`        | Documentation     | `agents-docs/agents/doc-agent.md`       |

### 4. Hooks System

Git hooks enforce quality before code enters the repository:

| Hook         | Purpose           | Location                |
| ------------ | ----------------- | ----------------------- |
| `pre-commit` | Quality gate      | `.git/hooks/pre-commit` |
| `commit-msg` | Message format    | `.git/hooks/commit-msg` |
| `pre-push`   | Pre-deploy checks | `.git/hooks/pre-push`   |

See [HOOKS.md](./HOOKS.md) for configuration details.

## Coordination Patterns

### Pattern 1: Parallel Discovery

Multiple discovery agents run simultaneously across different sources:

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Source A   │   │  Source B   │   │  Source C   │
│  Agent      │   │  Agent      │   │  Agent      │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       └─────────────────┼─────────────────┘
                         ↓
              ┌─────────────────┐
              │  Result Merger  │
              └────────┬────────┘
                       ↓
              ┌─────────────────┐
              │  Normalize/Dedupe│
              └─────────────────┘
```

**Skill**: `skill parallel-execution`

### Pattern 2: Sequential Pipeline

The 9-gate validation pipeline:

```
init → discover → normalize → dedupe → validate → score → stage → publish → verify → finalize
```

Each gate must pass before proceeding to the next.

**Skill**: `skill agent-coordination` → See `.agents/skills/agent-coordination/reference/SEQUENTIAL.md`

### Pattern 3: Swarm Analysis

Multiple agents analyze the same deal from different perspectives:

```
                    ┌─────────────┐
                    │   Deal X    │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ↓               ↓               ↓
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  Legitimacy │ │   Value     │ │   Urgency   │
    │   Analyst   │ │  Analyst    │ │   Analyst   │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           └───────────────┼───────────────┘
                           ↓
                    ┌─────────────┐
                    │  Consensus  │
                    └─────────────┘
```

**Skill**: `skill agent-coordination` → See `.agents/skills/agent-coordination/reference/SWARM.md`

### Pattern 4: GOAP Planning

Goal-Oriented Action Planning for complex multi-step tasks:

```
Goal: Deploy new discovery source

Plan:
1. Validate source URL patterns
2. Test extraction selectors
3. Configure trust score
4. Add to source registry
5. Run test discovery
6. Verify output format
7. Update documentation
```

**Skill**: `skill goap-agent`

## MCP Integration

### Cloudflare Platform MCP

The Cloudflare skills provide MCP-compliant interfaces:

```typescript
// Example: Using Cloudflare Workers skill
interface WorkersContext {
  env: {
    DEALS_PROD: KVNamespace;
    DEALS_STAGING: KVNamespace;
    DEALS_LOG: KVNamespace;
    DEALS_LOCK: KVNamespace;
    DEALS_SOURCES: KVNamespace;
  };
  ctx: ExecutionContext;
}
```

### Available MCP Servers

| Server                     | Purpose                  | Status    |
| -------------------------- | ------------------------ | --------- |
| `cloudflare-docs`          | Up-to-date documentation | Available |
| `cloudflare-bindings`      | Storage/AI/compute       | Available |
| `cloudflare-builds`        | Workers build insights   | Available |
| `cloudflare-observability` | Debug logs/analytics     | Available |

## Quality Gates Integration

Each gate is a skill-triggered checkpoint:

| Gate                | Skill Trigger               | Failure Action       |
| ------------------- | --------------------------- | -------------------- |
| Schema validation   | `skill validation-gates`    | Log error, skip deal |
| Normalization       | `skill validation-gates`    | Retry with fix       |
| Deduplication       | `skill validation-gates`    | Skip duplicate       |
| Source trust        | `skill trust-model`         | Quarantine deal      |
| Reward plausibility | `skill scoring-agent`       | Flag for review      |
| Expiry validation   | `skill expiration-manager`  | Reject expired       |
| Second-pass         | `skill validation-gates`    | Re-run pipeline      |
| Idempotency         | `skill distributed-locking` | Skip if exists       |
| Snapshot hash       | `skill crypto-utils`        | Reject mismatch      |

## Context Management

See [CONTEXT.md](./CONTEXT.md) for back-pressure patterns and context window management.

## Sub-Agent Isolation

See [SUB-AGENTS.md](./SUB-AGENTS.md) for context isolation patterns when delegating to sub-agents.

## Hook Verification

See [HOOKS.md](./HOOKS.md) for hook configuration, testing, and troubleshooting.

## Skill Authoring

See [SKILLS.md](./SKILLS.md) for creating new skills with progressive disclosure.

## Quick Reference

### Load Essential Skills

```bash
# Platform skills
skill cloudflare          # Workers, KV, D1, R2
skill agents-sdk          # Stateful agents
skill durable-objects     # State coordination
skill wrangler           # Deployment

# Coordination skills
skill agent-coordination  # Multi-agent patterns
skill goap-agent         # Goal planning
skill task-decomposition  # Task breakdown
skill parallel-execution  # Parallel workflows

# Quality skills
skill validation-gates    # 9-gate validation
skill circuit-breaker     # Failure isolation
skill structured-logging  # Observability
```

### Common Workflows

**Add New Discovery Source**:

```bash
1. skill goap-agent
2. skill agent-coordination (SEQUENTIAL.md)
3. skill validation-gates
```

**Debug Pipeline Failure**:

```bash
1. skill structured-logging
2. skill circuit-breaker
3. skill agent-coordination (ITERATIVE.md)
```

**Deploy to Production**:

```bash
1. skill wrangler
2. skill workers-best-practices
3. skill validation-gates
```

## Troubleshooting

### Skill Not Found

```bash
# Check skill location
ls ~/.agents/skills/          # Global skills
ls .agents/skills/            # Local skills

# Verify skill metadata
cat .agents/skills/<name>/SKILL.md | head -20
```

### Hook Failures

```bash
# Test hooks manually
.git/hooks/pre-commit
.git/hooks/commit-msg .git/COMMIT_EDITMSG

# Skip hooks (emergency only)
git commit --no-verify
git push --no-verify
```

### Coordination Issues

```bash
# Check state
cat temp/state.json

# Review handoff log
cat agents-docs/coordination/handoff-log.jsonl | tail -20

# Check blockers
cat agents-docs/coordination/blockers.md
```

## Related Documentation

- [SKILLS.md](./SKILLS.md) - Skill authoring guide
- [SUB-AGENTS.md](./SUB-AGENTS.md) - Sub-agent isolation
- [HOOKS.md](./HOOKS.md) - Hook configuration
- [CONTEXT.md](./CONTEXT.md) - Context management
- [SYSTEM_REFERENCE.md](./SYSTEM_REFERENCE.md) - System architecture
