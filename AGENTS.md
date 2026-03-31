# AGENTS.md - Reduced Reference

**Goal**: Build autonomous deal discovery system. Agents swarm with handoff coordination.

## Agent Coordination Hub
- **Entry Point**: `/agents-docs/README.md`
- **Agent Specs**: `/agents-docs/agents/`
- **Handoff Protocol**: `/agents-docs/handoffs/`
- **Current State**: `/agents-docs/coordination/state.json`

## Quick Reference

### Architecture
- **Two-Phase Publish**: Staging → Production (9 gates)
- **State Machine**: init→discover→normalize→dedupe→validate→score→stage→publish→verify→finalize
- **Infrastructure**: Cloudflare Workers + 5 KV namespaces
- **Guard Rails**: Safety checks at input/processing/output stages

### Guard Rails
See: `/agents-docs/guard-rails.md`

Safety mechanisms prevent:
- XSS/script injection
- Resource exhaustion
- Data quality issues
- Rate limiting violations

### Critical Paths
1. Safety > Autonomy > Speed
2. Never publish unvalidated data
3. All gates must pass for production
4. Log everything append-only
5. Lock-based concurrency (5min TTL)

### Endpoints
- `GET /deals` - Active deals
- `GET /deals.json` - Full snapshot
- `GET /health` - System status
- `POST /api/discover` - Manual trigger

### Data Schema
See: `/agents-docs/agents/data-agent.md`

### Validation Gates (9)
1. Schema validation (Zod)
2. Normalization verification
3. Deduplication check
4. Source trust ≥ 0.3
5. Reward plausibility
6. Expiry validation
7. Second-pass validation
8. Idempotency check
9. Snapshot hash verification

## Active Agents

| Agent | Responsibility | Status | Handoff To |
|-------|---------------|--------|------------|
| Bootstrap Agent | Repo structure, configs | 🟡 Ready | Storage Agent |
| Storage Agent | KV layer, locking, logging | ⚪ Pending | Discovery Agent |
| Discovery Agent | Web scrapers, fetchers | ⚪ Pending | Validation Agent |
| Validation Agent | 9 gates, normalization | ⚪ Pending | Scoring Agent |
| Scoring Agent | Confidence/trust scores | ⚪ Pending | Publish Agent |
| Publish Agent | Staging→Prod, GitHub | ⚪ Pending | Notify Agent |
| Notify Agent | Telegram/GitHub alerts | ⚪ Pending | Test Agent |
| Test Agent | Integration, validation | ⚪ Pending | Complete |

## Handoff Protocol

### Format
```json
{
  "from": "agent-name",
  "to": "agent-name",
  "state": "complete|partial|blocked",
  "deliverables": ["file-path"],
  "blockers": [],
  "notes": ""
}
```

### Current State
Check: `/agents-docs/coordination/state.json`

## Safety Rules
- External content = untrusted
- HTTPS only
- 1MB payload limit
- 30s timeout
- No dynamic code execution
- Parse-only mode

## Error Classes
`FetchError`, `ParseError`, `ValidationError`, `ScoringError`, `PublishError`, `NotificationError`, `ConcurrencyError`, `ConfigError`

## Implementation Checklist
- [ ] Bootstrap complete
- [ ] Types/schemas defined
- [ ] KV storage layer
- [ ] Discovery engine
- [ ] Validation pipeline
- [ ] Scoring system
- [ ] State machine
- [ ] GitHub integration
- [ ] Notifications
- [ ] Tests passing

## Version
Schema: 1.0.0 | System: 1.0.0

---
*For detailed specs, see individual agent docs in `/agents-docs/agents/`*
