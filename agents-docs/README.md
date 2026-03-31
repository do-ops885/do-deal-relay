# Agent Coordination Hub

## Swarm Architecture

Multiple specialized agents work in parallel with defined handoff points.

## Coordination Files

### State Tracking
- `/agents-docs/coordination/state.json` - Current world state
- `/agents-docs/coordination/handoff-log.jsonl` - Handoff history
- `/agents-docs/coordination/blockers.md` - Active blockers

### Agent Registry
All agents defined in `/agents-docs/agents/*.md`

## Handoff Protocol

### Trigger Conditions
1. Agent completes its scope
2. Agent encounters blocker
3. Parallel agent needs sync point
4. Critical error requires escalation

### Handoff Format

```json
{
  "handoff_id": "uuid",
  "timestamp": "ISO8601",
  "from_agent": "agent-name",
  "to_agent": "agent-name",
  "state": "complete|partial|blocked|error",
  "deliverables": [
    {
      "path": "relative/path",
      "type": "file|directory|config",
      "checksum": "sha256",
      "description": ""
    }
  ],
  "context": {
    "variables": {},
    "notes": ""
  },
  "blockers": [
    {
      "type": "dependency|error|question",
      "description": "",
      "blocking_agents": []
    }
  ],
  "next_steps": []
}
```

## Parallel Execution

### Concurrent Agents
- Bootstrap + Config Agent (initial)
- Discovery + Validation Agent (after storage)
- Scoring + Notify Agent (final)

### Sync Points
1. After Bootstrap (all files created)
2. After Storage (KV ready)
3. After Validation (data clean)
4. After Publish (production ready)

## Current State

Check latest handoff in `/agents-docs/coordination/handoff-log.jsonl`

## Agent Communication

### Via Files
- State changes → `coordination/state.json`
- Blockers → `coordination/blockers.md`
- Deliveries → Individual agent output dirs

### Via Comments
- GitHub issues for async discussion
- Code comments for in-file context

## Getting Started

1. Read your agent spec: `/agents-docs/agents/YOUR-AGENT.md`
2. Check current state: `/agents-docs/coordination/state.json`
3. Find your predecessor's handoff in log
4. Execute your scope
5. Create handoff to next agent
