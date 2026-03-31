# AGENTS.md - Deal Discovery System

**Goal**: Build autonomous deal discovery system with coordinated AI agents  
**Version**: 0.1.0-alpha  
**Phase**: Bootstrap  
**Status**: In Development

## Quick Start

```bash
# Install dependencies
npm install

# Run quality gate (silent on success)
./scripts/quality_gate.sh

# Run tests
npm test

# Start development
npm run dev
```

## Current Status

### Implementation Checklist

**Bootstrap Phase (Current):**

- [x] Repository structure
- [x] Core types/schemas
- [x] KV storage layer
- [x] Guard rails implementation
- [x] Agent coordination framework
- [ ] Test suite complete
- [ ] All validation gates passing
- [ ] Documentation complete

**Next Phases:**

- [ ] Discovery engine
- [ ] Validation pipeline (9 gates)
- [ ] Scoring system
- [ ] State machine
- [ ] GitHub integration
- [ ] Notifications
- [ ] Production deploy (v1.0.0)

## Architecture

- **Two-Phase Publish**: Staging → Production (9 gates)
- **State Machine**: init→discover→normalize→dedupe→validate→score→stage→publish→verify→finalize
- **Infrastructure**: Cloudflare Workers + 5 KV namespaces
- **Guard Rails**: Safety checks at input/processing/output stages

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

## Security Guidelines

### Critical Rules

1. **Safety > Autonomy > Speed**
2. Never publish unvalidated data
3. All gates must pass for production
4. Log everything append-only
5. Lock-based concurrency (5min TTL)

### Guard Rails

- External content = untrusted
- HTTPS only
- 1MB payload limit
- 30s timeout
- No dynamic code execution
- Parse-only mode

## Code Style

- **Max 500 lines per file** - split into focused sub-modules if exceeded
- **TypeScript**: Strict mode enabled, no implicit any
- **Naming**: camelCase for variables, PascalCase for types
- **Error handling**: Use custom error classes (see Error Classes)
- **Comments**: Minimal - code should be self-documenting
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `ci:`, `test:`, `refactor:`

## Testing

```bash
# Run all tests
npm test

# Run CI tests (headless)
npm run test:ci

# Type check only
npm run lint

# Validate all gates
npm run validate
```

### Requirements

- All code changes must include tests
- Coverage target: >80%
- Mock external services (KV, fetch)
- Integration tests for full pipeline

## Active Agents

| Agent            | Responsibility             | Status  | Handoff To       |
| ---------------- | -------------------------- | ------- | ---------------- |
| Bootstrap Agent  | Repo structure, configs    | Ready   | Storage Agent    |
| Storage Agent    | KV layer, locking, logging | Ready   | Discovery Agent  |
| Discovery Agent  | Web scrapers, fetchers     | Pending | Validation Agent |
| Validation Agent | 9 gates, normalization     | Pending | Scoring Agent    |
| Scoring Agent    | Confidence/trust scores    | Pending | Publish Agent    |
| Publish Agent    | Staging→Prod, GitHub       | Pending | Notify Agent     |
| Notify Agent     | Telegram/GitHub alerts     | Pending | Test Agent       |
| Test Agent       | Integration, validation    | Pending | Complete         |

**Status Legend:**

- Ready: Fully implemented and tested
- Pending: Awaiting implementation or testing
- Blocked: Has dependencies on other agents

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

## Error Classes

- `FetchError` - Network/HTTP issues
- `ParseError` - Data extraction failures
- `ValidationError` - Gate failures
- `ScoringError` - Confidence calculation issues
- `PublishError` - Deployment failures
- `NotificationError` - Alert system issues
- `ConcurrencyError` - Lock/contention issues
- `ConfigError` - Missing/invalid configuration

## Endpoints

- `GET /deals` - Active deals
- `GET /deals.json` - Full snapshot
- `GET /health` - System status
- `POST /api/discover` - Manual trigger

## Reference Documentation

- [Agent Specs](/agents-docs/agents/) - Individual agent documentation
- [Guard Rails](/agents-docs/guard-rails.md) - Security mechanisms
- [Data Schema](/agents-docs/agents/data-agent.md) - Deal structure
- [Handoffs](/agents-docs/handoffs/) - Handoff logs
- [Coordination](/agents-docs/coordination/) - State tracking
- [Harness](/agents-docs/HARNESS.md) - Multi-agent orchestration patterns
- [Sub-Agents](/agents-docs/SUB-AGENTS.md) - Context isolation

---

_For detailed specs, see individual agent docs in `/agents-docs/agents/`_
