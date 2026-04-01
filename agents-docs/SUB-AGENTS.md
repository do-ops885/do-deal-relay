# Sub-Agent Context Isolation

**System**: Deal Discovery Relay Worker
**Version**: 1.0.0
**Last Updated**: 2026-04-01

This guide covers patterns for delegating tasks to sub-agents while maintaining clean context boundaries and preventing context window overflow.

## Why Context Isolation?

AI agents have limited context windows. When tasks grow complex, we delegate to sub-agents with **isolated, focused contexts**:

| Problem                 | Solution                         |
| ----------------------- | -------------------------------- |
| Context window overflow | Delegate to focused sub-agent    |
| Information leakage     | Clear input/output contracts     |
| State corruption        | Immutable handoff documents      |
| Debugging complexity    | Tracked lineage via handoff logs |

## Context Window Limits

| Agent  | Context Window | Best For                   |
| ------ | -------------- | -------------------------- |
| Claude | 200K tokens    | Code, planning, file ops   |
| Gemini | 1M tokens      | Research, large analysis   |
| Qwen   | 128K tokens    | TS/JS patterns, validation |

## Isolation Patterns

### Pattern 1: Horizontal Slicing (By Domain)

Split a large task by domain area:

```
Parent Agent (Deal Analysis)
├─→ Sub-Agent A (Source Validation)
│   └─→ Input: Source URL, patterns
│   └─→ Output: Trust score, errors
│
├─→ Sub-Agent B (Deal Extraction)
│   └─→ Input: HTML content, selectors
│   └─→ Output: Deal struct
│
└─→ Sub-Agent C (Reward Calculation)
    └─→ Input: Deal struct, market data
    └─→ Output: Normalized reward
```

**Use When**: Task has distinct components that can be validated independently.

### Pattern 2: Vertical Slicing (By Pipeline Stage)

Split by pipeline stage with clean handoffs:

```
Discovery Sub-Agent
└─→ Output: RawDeals[]
    └─→ Handoff: temp/handoff-discovery.md

↓

Normalization Sub-Agent
└─→ Input: RawDeals[]
└─→ Output: NormalizedDeals[]
    └─→ Handoff: temp/handoff-normalize.md

↓

Validation Sub-Agent
└─→ Input: NormalizedDeals[]
└─→ Output: ValidatedDeals[]
```

**Use When**: Task follows a linear pipeline with clear stage boundaries.

### Pattern 3: Swarm Delegation (Parallel Analysis)

Multiple sub-agents analyze same input from different angles:

```
                    ┌─────────────────┐
                    │   Deal Data     │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ↓                   ↓                   ↓
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Security Agent  │ │  Value Agent    │ │  Source Agent   │
│                 │ │                 │ │                 │
│ Input: Deal     │ │ Input: Deal     │ │ Input: Deal     │
│ Output: Risk    │ │ Output: Score   │ │ Output: Trust   │
│     Score       │ │                 │ │     Score       │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         └───────────────────┼───────────────────┘
                             ↓
                    ┌─────────────────┐
                    │  Consensus      │
                    │  Aggregator     │
                    └─────────────────┘
```

**Use When**: Multiple dimensions of analysis needed on same data.

### Pattern 4: Hierarchical (Manager Pattern)

Manager sub-agent coordinates worker sub-agents:

```
Discovery Manager Agent
├─→ Worker 1: Source A discovery
├─→ Worker 2: Source B discovery
├─→ Worker 3: Source C discovery
└─→ Aggregator: Merge results
```

**Use When**: Coordinating multiple similar sub-tasks with different inputs.

## Handoff Document Format

Sub-agents communicate via structured handoff documents:

### File Naming

```
temp/handoff-<source-agent>-<target-agent>-<timestamp>.md
temp/handoff-discovery-normalize-20260401.md
temp/handoff-swarm-consensus-20260401.md
```

### Document Structure

```markdown
# Handoff: <Source Agent> → <Target Agent>

**Timestamp**: 2026-04-01T12:00:00Z
**Task**: Brief description
**Status**: complete | partial | blocked

## Inputs (What the sub-agent received)

- Input A: Description
- Input B: Description

## Outputs (What the sub-agent produced)

- Output A: Description or file path
- Output B: Description or file path

## Decisions Made

1. Decision A: Rationale
2. Decision B: Rationale

## Blockers (if any)

- Blocker: Description
- Mitigation: Attempted solution

## Context for Next Agent

- Key file: `path/to/file.ts`
- Important state: `temp/state.json`
- Known issues: None
```

## Implementation Guide

### Step 1: Define Contract

Before delegating, define:

```typescript
interface SubAgentContract {
  // What sub-agent needs
  inputs: {
    data: string; // Input data/file path
    format: string; // Expected format
    constraints: string[]; // Must-haves
  };

  // What sub-agent produces
  outputs: {
    data: string; // Output path
    format: string; // Output format
    validation: string; // How to verify
  };

  // Error handling
  onFailure: "abort" | "retry" | "skip";
  maxRetries: number;
}
```

### Step 2: Create Handoff Document

```typescript
function createHandoff(
  from: string,
  to: string,
  inputs: Record<string, unknown>,
  expectedOutputs: string[],
): string {
  return `
# Handoff: ${from} → ${to}
**Timestamp**: ${new Date().toISOString()}
**Status**: ready

## Inputs
${Object.entries(inputs)
  .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
  .join("\n")}

## Expected Outputs
${expectedOutputs.map((o) => `- [ ] ${o}`).join("\n")}
`;
}
```

### Step 3: Delegate to Sub-Agent

```bash
# Sub-agent reads handoff, AGENTS.md, its own spec
# Then executes with isolated context
```

### Step 4: Process Result

```typescript
function processHandoffResult(handoffPath: string): Result {
  const handoff = readFile(handoffPath);

  if (handoff.status === "blocked") {
    escalateToParent(handoff.blockers);
  }

  if (handoff.status === "complete") {
    integrateOutputs(handoff.outputs);
  }

  return { status: handoff.status, outputs: handoff.outputs };
}
```

## Context Pruning Strategies

### Strategy 1: Relevant File Selection

Only include files the sub-agent needs:

```typescript
// Parent agent selects relevant files
const relevantFiles = [
  "worker/pipeline/discover.ts", // Core logic
  "worker/lib/sources.ts", // Source types
  "worker/types.ts", // Type definitions
  // NOT: tests/, docs/, unrelated files
];

// Include in handoff
const handoff = {
  files: relevantFiles,
  purpose: "Implement new source adapter",
};
```

### Strategy 2: Summary Injection

Provide summaries instead of full documents:

```markdown
## Context Summary (vs Full Files)

### Architecture Overview

The deal discovery system uses a 9-gate pipeline: discover → normalize →
dedupe → validate → score → stage → publish → verify → finalize.

### Relevant Files

- `worker/pipeline/discover.ts`: Discovery orchestrator
- `worker/lib/sources.ts`: Source registry interface
- `worker/types.ts`: Deal and SourceConfig types

### Your Task

Implement a new source adapter for ProductHunt following the existing
patterns in `worker/lib/sources.ts`.
```

### Strategy 3: Progressive Loading

Load skills only when needed:

```bash
# Don't load all skills upfront
# Load on-demand as sub-agent progresses

# Step 1: Basic implementation
skill cloudflare

# Step 2: Need coordination patterns
skill agent-coordination

# Step 3: Encounter validation issue
skill validation-gates
```

## Error Isolation

### Sub-Agent Failure Modes

| Mode       | Behavior                | Use When               |
| ---------- | ----------------------- | ---------------------- |
| `abort`    | Stop entire pipeline    | Critical path failure  |
| `retry`    | Retry with same agent   | Transient failure      |
| `skip`     | Continue without output | Optional analysis      |
| `fallback` | Switch to backup agent  | Agent-specific failure |

### Circuit Breaker Integration

```typescript
// From skill circuit-breaker
interface CircuitBreaker {
  state: "closed" | "open" | "half-open";
  failureCount: number;
  lastFailureTime: number;
}

function delegateToSubAgent(agent: string, task: Task): Result {
  const cb = getCircuitBreaker(agent);

  if (cb.state === "open") {
    return { status: "skipped", reason: "Circuit breaker open" };
  }

  try {
    const result = executeSubAgent(agent, task);
    recordSuccess(cb);
    return result;
  } catch (error) {
    recordFailure(cb);
    throw error;
  }
}
```

## Monitoring Sub-Agents

### Handoff Log

All handoffs recorded in `agents-docs/coordination/handoff-log.jsonl`:

```json
{"timestamp":"2026-04-01T12:00:00Z","from":"discovery-agent","to":"normalize-agent","status":"complete","duration":45000}
{"timestamp":"2026-04-01T12:01:00Z","from":"normalize-agent","to":"validate-agent","status":"blocked","blocker":"schema-validation-failed"}
```

### Blocker Tracking

Escalated issues recorded in `agents-docs/coordination/blockers.md`:

```markdown
## Active Blockers

### 2026-04-01: Schema Validation Failure

**Agent**: validate-agent
**Issue**: ProductHunt deals missing required 'expiry' field
**Attempted**:

- Default expiry to 30 days
- Skip validation for this source
  **Hypothesis**: Source adapter needs expiry extraction
  **Assigned**: discovery-agent
```

## Best Practices

### 1. Keep Contracts Clear

```typescript
// Good: Explicit contract
interface DiscoveryContract {
  input: {
    sourceUrl: string;
    selectors: Record<string, string>;
    timeout: number;
  };
  output: {
    deals: Deal[];
    errors: Array<{ url: string; error: string }>;
    sourceTrustDelta: number;
  };
}

// Bad: Ambiguous contract
function discover(url: string): Promise<any>;
```

### 2. Include Validation in Contract

```typescript
interface OutputValidation {
  // Schema validation
  schema: z.ZodSchema;

  // Business rules
  rules: Array<(output: unknown) => boolean>;

  // Example check
  examples: unknown[];
}
```

### 3. Time-Box Sub-Agents

```typescript
const SUB_AGENT_TIMEOUTS = {
  discovery: 5 * 60 * 1000, // 5 minutes
  validation: 2 * 60 * 1000, // 2 minutes
  scoring: 1 * 60 * 1000, // 1 minute
};
```

### 4. Clean Up Handoff Files

```bash
# Archive old handoffs
find temp/handoff-*.md -mtime +7 -exec gzip {} \;

# Or delete if gitignored anyway
rm temp/handoff-*.md  # Safe: these are temp files
```

## Quick Reference

### When to Delegate

| Task Size          | Context Used | Action                     |
| ------------------ | ------------ | -------------------------- |
| <100 tokens        | <20%         | Handle in parent           |
| 100-500 tokens     | 20-50%       | Consider delegation        |
| >500 tokens        | >50%         | Delegate to sub-agent      |
| Unknown complexity | Unknown      | Use exploratory delegation |

### Delegation Checklist

- [ ] Contract defined (inputs, outputs, errors)
- [ ] Handoff document created
- [ ] Sub-agent scope is focused (<5 files)
- [ ] Timeout configured
- [ ] Failure mode specified
- [ ] Result validation defined
- [ ] Handoff log entry ready

### Template: Sub-Agent Delegation

```typescript
// 1. Define contract
const contract: SubAgentContract = {
  inputs: {
    /* ... */
  },
  outputs: {
    /* ... */
  },
  onFailure: "retry",
  maxRetries: 2,
};

// 2. Create handoff
const handoff = createHandoff("parent", "sub", contract.inputs, [
  "output-a",
  "output-b",
]);
writeFile("temp/handoff-parent-sub.md", handoff);

// 3. Execute sub-agent
const result = await executeSubAgent("sub-agent", "temp/handoff-parent-sub.md");

// 4. Process result
if (result.status === "complete") {
  integrateOutputs(result.outputs);
} else {
  handleFailure(result);
}

// 5. Log handoff
logHandoff("parent", "sub", result.status);
```

## Related Documentation

- [HARNESS.md](./HARNESS.md) - System overview
- [CONTEXT.md](./CONTEXT.md) - Back-pressure patterns
- [SKILLS.md](./SKILLS.md) - Skill authoring
- `agents-docs/coordination/handoff-log.jsonl` - Handoff history
