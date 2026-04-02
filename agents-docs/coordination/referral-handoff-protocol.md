# Referral System Handoff Coordination Protocol

**Version: 0.1.1  
**Date**: 2026-04-01  
**Swarm\*\*: referral-management-swarm

## Overview

This document defines the handoff coordination protocol for the multi-agent referral management system. It ensures seamless transitions between agents during referral code ingestion, research, validation, and deactivation workflows.

## Agent Responsibilities

### Interface Agents (Parallel Execution)

| Agent                       | Input Methods     | Primary Role              |
| --------------------------- | ----------------- | ------------------------- |
| `cli-interface-agent`       | CLI commands      | Process `refcli` commands |
| `api-interface-agent`       | REST API          | Handle HTTP requests      |
| `extension-interface-agent` | Browser extension | Auto-detect and capture   |
| `bot-interface-agent`       | Telegram/Discord  | Chat-based commands       |
| `email-interface-agent`     | Email parsing     | Forward/command emails    |
| `webhook-interface-agent`   | Webhook POSTs     | Partner integrations      |

### Processing Agents (Sequential with Quality Gates)

| Agent                | Phase        | Role                         |
| -------------------- | ------------ | ---------------------------- |
| `ingestion-agent`    | Ingestion    | Normalize and validate input |
| `research-agent`     | Research     | Discover additional codes    |
| `validation-agent`   | Validation   | Validate and deduplicate     |
| `deactivation-agent` | Deactivation | Handle code deactivation     |
| `synthesis-agent`    | Synthesis    | Aggregate and store results  |

## Handoff Rules

### 1. Input Reception → Ingestion

**Trigger**: Interface agent receives valid input
**Conditions**:

- No validation errors at interface level
- Required fields present (code, url, domain)

**Data Mapping**:

```
Interface Output        → Ingestion Input
─────────────────────────────────────────
raw_referral_data       → normalized_referral
source_type             → metadata.source
submitter_id            → metadata.submitted_by
timestamp               → submitted_at
```

**Failure Action**: Quarantine with error log

### 2. Ingestion → Research

**Trigger**: New referral domain detected
**Conditions**:

- Min 1 referral ingested
- No ingestion errors

**Data Mapping**:

```
referral.domain         → research_query
metadata.confidence     → min_confidence_threshold
```

**Failure Action**: Skip research, proceed to validation

### 3. Ingestion → Validation

**Trigger**: Referral normalized and ready
**Conditions**:

- All validation rules pass
- Schema validation successful

**Data Mapping**:

```
normalized_referral     → validation_target
research_results        → additional_codes (optional)
```

**Failure Action**: Quarantine with validation errors

### 4. Validation → Deactivation

**Trigger**: Deactivation request received
**Conditions**:

- Custom: `deactivation_requested` flag set
- Code exists in system

**Data Mapping**:

```
referral_id             → deactivation_target
deactivation_reason     → metadata.deactivated_reason
replacement_code        → related_codes
```

**Failure Action**: Retry with exponential backoff

### 5. Validation → Synthesis

**Trigger**: Validation complete
**Conditions**:

- No validation errors
- Trust score ≥ threshold

**Data Mapping**:

```
validated_referral      → storage_candidate
validation_score        → metadata.confidence_score
research_metadata       → metadata.research_sources
```

**Failure Action**: Retry or escalate

## Handoff File Format

All agents write handoff files to `temp/handoff-{agent-id}-{timestamp}.md`:

````markdown
# Handoff: {from_agent} → {to_agent}

## Status

- **Phase**: {phase_name}
- **Trigger**: {complete|failure|timeout}
- **Timestamp**: {ISO8601}

## Data Summary

- **Items Processed**: {count}
- **Success Rate**: {percentage}
- **Errors**: {count}

## Key Outputs

```json
{
  "referral_id": "...",
  "status": "...",
  "next_actions": [...]
}
```
````

## Blockers

- {None | description}

## Next Agent Instructions

- [ ] Action 1
- [ ] Action 2

````

## Coordination Log

All handoffs are logged to `agents-docs/coordination/handoff-log.jsonl`:

```json
{
  "timestamp": "2026-04-01T12:00:00Z",
  "from_agent": "cli-interface-agent",
  "to_agent": "ingestion-agent",
  "phase": "input_reception",
  "trigger": "complete",
  "items_count": 1,
  "duration_ms": 150,
  "handoff_file": "temp/handoff-cli-1234567890.md"
}
````

## Escalation Policy

### Threshold: 30 minutes

If an agent is blocked for more than 30 minutes:

1. **Auto-escalate** to `synthesis-agent`
2. **Notification** sent via configured channels (Telegram, webhook)
3. **Fallback** to manual review queue

### Escalation Targets

- Primary: `synthesis-agent`
- Secondary: System administrator notification
- Emergency: Skip phase, mark for manual review

## Parallel Execution Groups

### Group 1: Interface Agents

All interface agents execute in parallel:

- Max concurrency: 6
- Failure mode: Continue (don't stop other agents)
- Sync point: Before Ingestion phase

### Group 2: Research Sources

Research across sources executes in parallel:

- Max concurrency: 5
- Failure mode: Best effort
- Aggregation: Merge results

## Quality Gates Between Handoffs

| Gate              | From → To              | Check                   | Blocking       |
| ----------------- | ---------------------- | ----------------------- | -------------- |
| Schema Validation | Ingestion → Research   | Required fields present | Yes            |
| Duplicate Check   | Ingestion → Validation | No duplicate codes      | Yes            |
| Trust Score       | Validation → Synthesis | Score ≥ 0.5             | No (warn only) |

## State Management

Agents check `temp/state.json` before and after handoffs:

```json
{
  "current_phase": "validation",
  "active_agents": ["validation-agent"],
  "pending_handoffs": [{ "from": "validation-agent", "to": "synthesis-agent" }],
  "quarantined_items": [],
  "last_updated": "2026-04-01T12:00:00Z"
}
```

## Example Handoff Flow

```
User submits code via CLI
    ↓
[cli-interface-agent] - Parse command
    ↓ (Handoff 1)
[ingestion-agent] - Normalize data
    ↓ (Handoff 2 - parallel)
    ├─→ [research-agent] - Research domain
    └─→ [validation-agent] - Validate code
    ↓ (Handoff 3)
[synthesis-agent] - Store results
    ↓
API Response to User
```

## Emergency Procedures

### Context Overflow

1. Write minimal handoff: `temp/handoff-minimal.md`
2. Include only essential: referral_id, status, next_agent
3. Delegate to focused sub-agent

### Agent Failure

1. Log failure to handoff log
2. Notify synthesis-agent
3. Activate backup agent (if configured)
4. Retry with exponential backoff

### Data Corruption

1. Quarantine affected data
2. Restore from previous checkpoint
3. Re-run from last successful phase
4. Alert administrators

## Best Practices

### DO:

- ✓ Always write handoff files
- ✓ Include complete context for next agent
- ✓ Log all state changes
- ✓ Use parallel execution where possible
- ✓ Implement retry logic

### DON'T:

- ✗ Skip handoff documentation
- ✗ Block indefinitely without escalation
- ✗ Lose error context between agents
- ✗ Overload single agent with all work
- ✗ Forget to clean up temp files
