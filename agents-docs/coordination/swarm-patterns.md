# Swarm Coordination Patterns

**Version: 0.1.1
**Last Updated**: 2026-04-01
**Status\*\*: Active

## Overview

This document defines reusable swarm coordination patterns for multi-agent collaboration. Each pattern serves specific use cases and can be combined for complex workflows.

## Pattern 1: Research Swarm

**Agents**: Gemini + Qwen
**Use Case**: Web research and information discovery
**Execution**: Parallel

### Workflow

1. **Delegate** web research tasks to multiple agents
2. **Aggregate** results in `temp/swarm-research-{topic}-{timestamp}.md`
3. **Synthesize** findings into actionable insights

### Example

```
Research Task: "Find referral codes for picnic.app"
├─→ Gemini: Search ProductHunt, GitHub
├─→ Qwen: Search Reddit, Hacker News
└─→ Aggregate: temp/swarm-research-picnic-123456.md
```

### Output Format

```markdown
# Swarm Research Results: {topic}

## Sources

- Source 1: {agent} - {url}
- Source 2: {agent} - {url}

## Findings

### Finding 1

**Source**: {agent}
**Confidence**: {high|medium|low}
**Content**: ...

## Consensus

{Summary of agreed-upon findings}

## Disagreements

{Areas where agents disagree}
```

## Pattern 2: Validation Pipeline

**Agents**: Claude + Qwen
**Use Case**: Quality gates and validation
**Execution**: Parallel with fail-fast

### Workflow

1. **Run** all validation gates in parallel
2. **Aggregate** results
3. **Fail fast** on any blocking issue

### Gates

| Gate                   | Agent  | Blocking |
| ---------------------- | ------ | -------- |
| TypeScript compilation | Qwen   | Yes      |
| Unit tests             | Claude | Yes      |
| Validation gates       | Qwen   | Yes      |
| Security checks        | Claude | Yes      |
| URL preservation       | Both   | Yes      |

### Output

```json
{
  "validation_id": "val-123",
  "timestamp": "2026-04-01T12:00:00Z",
  "results": [
    { "gate": "typescript", "status": "pass", "agent": "qwen" },
    { "gate": "security", "status": "pass", "agent": "claude" }
  ],
  "overall": "pass"
}
```

## Pattern 3: Code Review Swarm

**Agents**: Claude + Gemini
**Use Case**: Multi-module code review
**Execution**: Parallel by module

### Workflow

1. **Split** codebase by module (worker/, tests/, scripts/)
2. **Assign** each module to an agent
3. **Review** independently
4. **Consolidate** findings

### Module Assignment

| Module   | Agent  | Files               |
| -------- | ------ | ------------------- |
| worker/  | Claude | Core business logic |
| tests/   | Qwen   | Test coverage       |
| scripts/ | Gemini | CLI and utilities   |

### Output

```markdown
# Code Review Swarm Results

## Module: worker/

**Agent**: Claude
**Files**: 12
**Issues**: 3 minor
**Status**: Approved

### Key Findings

...

## Module: tests/

**Agent**: Qwen
...
```

## Pattern 4: Referral Management Swarm

**Agents**: All agents (6 interface agents + processing agents)
**Use Case**: Referral code ingestion and management
**Execution**: Parallel interface + Sequential processing
**Configuration**: [referral-swarm-config.json](referral-swarm-config.json)

### Structure

**Parallel Group (Interface Agents)**:

- CLI interface agent
- API interface agent
- Browser extension agent
- Chat bot agent
- Email integration agent
- Webhook agent

**Sequential Pipeline (Processing Agents)**:

1. **Ingestion** → Normalize and validate input
2. **Research** → Discover additional codes
3. **Validation** → Validate and deduplicate
4. **Deactivation** → Handle code deactivation
5. **Synthesis** → Aggregate and store results

### Quality Gates Between Phases

| Gate              | From → To              | Check                   |
| ----------------- | ---------------------- | ----------------------- |
| Schema Validation | Ingestion → Research   | Required fields present |
| Duplicate Check   | Ingestion → Validation | No duplicate codes      |
| Trust Score       | Validation → Synthesis | Score ≥ 0.5             |

### Handoff Protocol

See [referral-handoff-protocol.md](referral-handoff-protocol.md) for detailed handoff rules.

## Pattern 5: Continuous Verification Loop

**Agents**: 3+ agents with different perspectives
**Use Case**: Complex tasks requiring iterative refinement
**Execution**: Loop until consensus

### Workflow Diagram

```
Loop Until All Pass:
├─→ Spawn swarm of 3+ agents (different perspectives)
├─→ Each agent verifies and evaluates independently
├─→ Check for consensus (2 of 3 agree)
├─→ If consensus: BREAK loop, return result
├─→ If disagreement: Analyze conflicts, refine task
├─→ Create handoff with refined requirements
└─→ Loop again with fresh agents (prevent context bloat)
```

### Loop Requirements

1. **Fresh Agents**: Always use fresh agents in each iteration (no context carry-over)
2. **Handoff State**: Handoff documents carry state between iterations
3. **Stop Condition**: Stop when all agents agree or max iterations reached (5)
4. **Context Limit**: Keep each agent's context under 50% by limiting files (<5 per agent)
5. **Logging**: Log each iteration to `temp/swarm-loop-log.jsonl`

### Consensus Rules

| Scenario   | Action                            |
| ---------- | --------------------------------- |
| 3/3 agree  | Consensus achieved, return result |
| 2/3 agree  | Consensus achieved, return result |
| 1/3 or 0/3 | No consensus, refine and retry    |

### Iteration Log Format

```jsonl
{"iteration": 1, "timestamp": "2026-04-01T12:00:00Z", "agents": ["claude", "gemini", "qwen"], "consensus": false, "conflict_areas": ["approach", "file_structure"]}
{"iteration": 2, "timestamp": "2026-04-01T12:05:00Z", "agents": ["claude", "gemini", "qwen"], "consensus": true, "result": "approved"}
```

## Combining Patterns

### Complex Workflow Example

```
Project: Implement new referral source

Phase 1: Research Swarm
├─→ Pattern 1: Research domain
└─→ Output: temp/swarm-research-{domain}.md

Phase 2: Implementation
├─→ Pattern 3: Code review of existing sources
└─→ Parallel implementation agents

Phase 3: Validation
├─→ Pattern 2: Validation pipeline
└─→ All gates must pass

Phase 4: Verification
├─→ Pattern 5: Continuous verification
└─→ 3 agents verify implementation
```

## Implementation

Load the `skill parallel-execution` for pattern implementation:

```bash
skill parallel-execution
```

### Configuration

Swarm configurations stored in `agents-docs/coordination/`:

| Config File                       | Purpose                   |
| --------------------------------- | ------------------------- |
| `referral-swarm-config.json`      | Referral management swarm |
| `input-methods-swarm-config.json` | Input methods swarm       |
| `swarm-config.schema.json`        | Schema validation         |

## Best Practices

### DO:

- ✓ Choose the right pattern for the task
- ✓ Use parallel execution where possible
- ✓ Implement fail-fast in validation pipelines
- ✓ Log all iterations in continuous loops
- ✓ Combine patterns for complex workflows
- ✓ Keep swarm size appropriate (3-6 agents typically)

### DON'T:

- ✗ Use continuous loop for simple tasks
- ✗ Spawn too many agents (context overhead)
- ✗ Skip handoff documentation between patterns
- ✗ Run patterns without configuration files
- ✗ Ignore consensus disagreements
- ✗ Let loops run indefinitely

## Metrics and Monitoring

Track swarm performance:

| Metric                      | Target  | Alert Threshold |
| --------------------------- | ------- | --------------- |
| Swarm completion time       | <30 min | >1 hour         |
| Iteration count (Pattern 5) | <3      | >5              |
| Consensus rate              | >90%    | <70%            |
| Agent utilization           | 70-90%  | <50% or >95%    |

## Related Documentation

- [Handoff Protocol](handoff-protocol.md) - Agent transition rules
- [Sub-Agent Patterns](../SUB-AGENTS.md) - Context isolation
- [Referral Handoff Protocol](referral-handoff-protocol.md) - Referral specific
- [Input Methods Protocol](input-methods-handoff-protocol.md) - Input swarm specific
