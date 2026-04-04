# Handoff Coordination Protocol

**Version: 0.1.1
**Last Updated**: 2026-04-01
**Status\*\*: Active

## Overview

This document defines the core handoff coordination protocol for all agent-to-agent transitions in the deal discovery system. It ensures seamless context transfer, prevents information loss, and manages resource constraints effectively.

For swarm-specific protocols, see:

- [Input Methods Handoff Protocol](input-methods-handoff-protocol.md)
- [Referral Handoff Protocol](referral-handoff-protocol.md)

## Trigger Conditions

Handoffs are triggered by:

1. **Context limit** - Approaching token budget threshold
2. **Agent switch** - Different agent type/role needed
3. **Task completion** - Current phase finished, next phase ready
4. **Parallel need** - Work can be split across multiple agents

## Handoff Steps

1. Current agent writes `temp/handoff-*.md` with:
   - Task status (done/partial/blocked)
   - Key decisions made
   - Next steps for receiving agent
   - Relevant file paths

2. Update `agents-docs/coordination/handoff-log.jsonl` with handoff metadata

3. Next agent reads:
   - Handoff file
   - AGENTS.md (coordination hub)
   - Its own agent specification

4. Confirm understanding before proceeding with next phase

## Context Window Management (CRITICAL)

To prevent context overflow, always delegate to sub-agents with isolated, focused contexts:

| Context Used      | Action                                    |
| ----------------- | ----------------------------------------- |
| <20% (healthy)    | Continue in current agent                 |
| 20-50% (elevated) | Consider task delegation                  |
| >50% (critical)   | Delegate to focused sub-agent immediately |

### Delegation Pattern

```
Parent Agent
├─→ Create handoff: temp/handoff-parent-sub.md
├─→ Delegate to Sub-Agent A (isolated context)
│   └─→ Sub-Agent A executes with <5 files
│   └─→ Sub-Agent A writes handoff result
├─→ Delegate to Sub-Agent B (isolated context)
│   └─→ Sub-Agent B executes with <5 files
│   └─→ Sub-Agent B writes handoff result
└─→ Aggregate results from handoffs
```

**Key Principles**:

- Sub-agents receive <5 files to maintain context health
- Each sub-agent writes its own handoff result
- Parent agent aggregates and synthesizes final output
- No context carry-over between sub-agents (fresh context each)

## Blocker Escalation

**Threshold**: 30 minutes stuck on a task

If an agent is blocked for more than 30 minutes:

1. **Escalate** to `agents-docs/coordination/blockers.md` with:
   - Issue description
   - Attempted fixes
   - Relevant code snippets
   - Hypothesis for resolution

2. **Notification** sent to synthesis-agent and system administrators

3. **Fallback** options:
   - Retry with different approach
   - Delegate to alternative agent
   - Skip phase and mark for manual review

## Handoff File Format

All agents write to `temp/handoff-{from_agent}-{to_agent}.md`:

```markdown
# Handoff: {from_agent} → {to_agent}

## Status

- **Phase**: {phase_name}
- **Status**: {complete|partial|blocked}
- **Timestamp**: {ISO8601}

## Summary

- Files created: {count}
- Tests passing: {count}/{total}
- Blockers: {none|description}

## Key Decisions

1. Decision 1 with rationale
2. Decision 2 with rationale

## Next Steps for {to_agent}

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Relevant Files

- `/path/to/file1.ts` - Purpose
- `/path/to/file2.ts` - Purpose

## Blockers

- {None | description and attempted fixes}
```

## Coordination Log

All handoffs logged to `agents-docs/coordination/handoff-log.jsonl`:

```json
{
  "timestamp": "2026-04-01T12:00:00Z",
  "from_agent": "cli-agent",
  "to_agent": "research-agent",
  "phase": "discovery",
  "status": "complete",
  "items_count": 5,
  "duration_ms": 1500,
  "handoff_file": "temp/handoff-cli-research.md",
  "context_usage": 45000
}
```

## Emergency Procedures

### Context Overflow

1. Write minimal handoff: `temp/handoff-minimal.md`
2. Include only essential: agent_id, status, blocker status
3. Delegate to focused sub-agent immediately
4. Log overflow event to handoff log

### Agent Failure

1. Log failure to handoff log with error details
2. Notify synthesis-agent and parent agent
3. Activate backup agent (if configured)
4. Retry with exponential backoff (max 3 attempts)

### Data Loss Prevention

1. Never proceed without handoff documentation
2. Include complete file paths in handoffs
3. Log all state changes to coordination log
4. Quarantine incomplete operations

## Best Practices

### DO:

- ✓ Always write handoff files before switching agents
- ✓ Include complete context for next agent
- ✓ Log all state changes to coordination log
- ✓ Delegate at >50% context usage
- ✓ Limit files per sub-agent to <5
- ✓ Confirm understanding before proceeding

### DON'T:

- ✗ Skip handoff documentation
- ✗ Block indefinitely without escalation
- ✗ Lose error context between agents
- ✗ Overload single agent with excessive files
- ✗ Forget to update coordination log
- ✗ Carry stale context to new iterations

## Related Documentation

- [Sub-Agent Patterns](../SUB-AGENTS.md) - Context isolation patterns
- [Context Management](../CONTEXT.md) - Token budgeting and back-pressure
- [Swarm Patterns](swarm-patterns.md) - Multi-agent coordination patterns
- [Input Methods Protocol](input-methods-handoff-protocol.md) - Input swarm specific
- [Referral Protocol](referral-handoff-protocol.md) - Referral system specific

## References

See [agents-docs/coordination/](./) directory for all coordination files.
