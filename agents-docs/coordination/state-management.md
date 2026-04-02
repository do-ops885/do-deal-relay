# State Management

**Reference**: Active state files and their purposes
**Version**: 0.1.1
**Last Updated**: 2026-04-02

## State Files

| File                         | Purpose                                 | Location                    |
| ---------------------------- | --------------------------------------- | --------------------------- |
| `state.json`                 | Active agent status, current phase      | `temp/`                     |
| `skills-lock.json`           | External skill version tracking         | `temp/`                     |
| `handoff-log.jsonl`          | Handoff history                         | `agents-docs/coordination/` |
| `blockers.md`                | Escalated issues                        | `agents-docs/coordination/` |
| `referral-swarm-config.json` | Swarm configuration                     | `agents-docs/coordination/` |
| `swarm-loop-log.jsonl`       | Continuous verification loop iterations | `temp/`                     |

## Usage

### temp/state.json

Contains current active agent assignments, task status, and phase information. Used for:

- Agent coordination
- Task tracking
- Context window management decisions

### temp/skills-lock.json

Tracks versions of external skills. Used for:

- Dependency management
- Skill compatibility
- Version pinning

### agents-docs/coordination/handoff-log.jsonl

Append-only log of all agent handoffs. Used for:

- Context recovery
- Debugging coordination issues
- Audit trail

### agents-docs/coordination/blockers.md

Active blockers and escalated issues. Used for:

- Tracking stuck tasks
- Priority management
- Team communication

### agents-docs/coordination/referral-swarm-config.json

Configuration for referral management swarm. Used for:

- Agent orchestration
- Task distribution
- Swarm behavior rules

### temp/swarm-loop-log.jsonl

Log of continuous verification loop iterations. Used for:

- Iterative refinement tracking
- Consensus checking
- Quality assurance

## Related Documentation

- [Handoff Protocol](./handoff-log.jsonl) - Coordination protocol
- [Blockers](./blockers.md) - Escalation process
- [AGENTS.md](../AGENTS.md) - Master coordination hub
