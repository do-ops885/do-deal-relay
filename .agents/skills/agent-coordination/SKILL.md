---
name: agent-coordination
description: Coordination protocol for multi-agent swarms. Use for handoffs, state management, and parallel execution.
---

# Agent Coordination

Orchestrate specialized agents within the `do-deal-relay` ecosystem.

## When to Use
Activate when performing tasks that span multiple domains (e.g., Worker change + Extension update + Documentation).

## Instructions
1. **Handoff Protocol**: Use `agents-docs/coordination/handoff-log.jsonl` for all transitions.
2. **State Tracking**: Update `agents-docs/coordination/state.json` after significant milestones.
3. **Blocker Transparency**: Log dependencies in `agents-docs/coordination/blockers.md`.
4. **Parallel Safety**: Use domain-partitioning to avoid conflicts during parallel execution.

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "Handoff logs are too verbose." | They provide the only audit trail for multi-agent workflows. |
| "I can just finish the whole task myself." | Decomposing into specialized sub-agents reduces context rot and improves quality. |
| "State.json is out of sync." | Keeping state updated is the responsibility of the active agent. |

## Red Flags

- [ ] Overlapping file writes between parallel agents.
- [ ] Unresolved blockers in `blockers.md` while proceeding with execution.
- [ ] Handoffs without clear deliverables or checksums.
