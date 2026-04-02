# System Reference

**System**: Deal Discovery System
**Version**: 0.1.1
**Phase**: Bootstrap
**Status**: In Development

## Architecture

### Project Structure

```
├── .github/workflows/    # CI/CD workflows
├── .agents/skills/       # Agent coordination skills
├── agents-docs/          # System documentation
├── docs/                 # API documentation
├── plans/                # Execution plans
├── scripts/              # Utility scripts
├── temp/                 # Analysis reports & state (gitignored)
├── tests/                # Test suite
└── worker/               # Cloudflare Worker source
```

### File Organization Rules

**CRITICAL**: Only these files belong in root:

- `.gitignore` - Git ignore patterns
- `package.json` - NPM manifest
- `package-lock.json` - NPM lockfile
- `tsconfig.json` - TypeScript config
- `vitest.config.ts` - Test runner config
- `wrangler.toml` - Cloudflare Workers config
- `README.md` - Main project documentation
- `VERSION` - Version file

**ALL other files MUST use appropriate subfolders**:

- Reports/status → `temp/`
- Documentation → `docs/` or `agents-docs/`
- Scripts → `scripts/`
- Tests → `tests/`
- Source code → `worker/`

### Two-Phase Publishing

**Staging → Production** with 9 validation gates:

1. Schema validation (Zod)
2. Normalization verification
3. Deduplication check
4. Source trust ≥ 0.3
5. Reward plausibility
6. Expiry validation
7. Second-pass validation
8. Idempotency check
9. Snapshot hash verification

### State Machine Flow

```
init → discover → normalize → dedupe → validate → score → stage → publish → verify → finalize
```

### Infrastructure

**Cloudflare Workers** + **5 KV Namespaces**:

- `DEALS_PROD` - Production deals
- `DEALS_STAGING` - Staging area
- `DEALS_LOG` - Pipeline logs
- `DEALS_LOCK` - Distributed locking
- `DEALS_SOURCES` - Source tracking

**Configuration**:

- Cron: Every 6 hours
- Max deals per run: 1000
- Trust threshold: 0.3
- High value threshold: > $100

## Testing

### Commands

```bash
# Run all tests
npm test

# CI mode (headless)
npm run test:ci

# Type check only
npm run lint

# Validate all gates
npm run validate
```

### Requirements

- Target coverage: >80%
- Mock external services (KV, fetch)
- Integration tests for full pipeline

## Code Style

### TypeScript

- Strict mode enabled
- No implicit `any`
- camelCase for variables
- PascalCase for types

### File Structure

- **Max 500 lines per file** - split into focused sub-modules if exceeded
- Minimal comments - code should be self-documenting

### Error Handling

Use custom error classes:

- `FetchError` - HTTP request failures
- `ParseError` - Data parsing errors
- `ValidationError` - Schema validation failures
- `ScoringError` - Trust/reward calculation errors
- `PublishError` - Deployment failures
- `NotificationError` - Alert delivery failures
- `ConcurrencyError` - Lock conflicts
- `ConfigError` - Configuration errors

## Security

### Guidelines

- HTTPS only
- 1MB payload limit
- 30s timeout
- No dynamic code execution

See [guard-rails.md](guard-rails.md) for full security details.

## API Endpoints

| Endpoint        | Method | Description        |
| --------------- | ------ | ------------------ |
| `/deals`        | GET    | Active deals       |
| `/deals.json`   | GET    | Full snapshot      |
| `/health`       | GET    | System status      |
| `/api/discover` | POST   | Manual trigger     |
| `/metrics`      | GET    | Prometheus metrics |
| `/api/status`   | GET    | Pipeline status    |
| `/api/log`      | GET    | Query logs         |
| `/api/submit`   | POST   | Submit deal        |

## Active Agents

| Agent               | Status  | Phase           | Responsibility      |
| ------------------- | ------- | --------------- | ------------------- |
| test-agent-v2       | pending | Test & Validate | Integration testing |
| validation-agent-v2 | pending | Test & Validate | 9 validation gates  |
| doc-agent           | pending | Test & Validate | Documentation       |
| github-agent        | pending | Test & Validate | GitHub integration  |
| browser-agent       | pending | Test & Validate | Browser testing     |

## Skills

### Local Coordination Skills

Located in `.agents/skills/`:

- `agent-coordination` - Multi-agent orchestration
- `goap-agent` - Goal-oriented planning
- `task-decomposition` - Task breakdown
- `parallel-execution` - Parallel workflows

### External Platform Skills

Installed globally:

- `cloudflare` - Platform expertise (Workers, Pages, KV, D1, R2, AI)
- `agents-sdk` - Building stateful AI agents
- `durable-objects` - Stateful coordination
- `wrangler` - Deployment and management
- `workers-best-practices` - Performance optimization

Use: `skill <name>` to load platform guidance.

## Related Documentation

- [Architecture Overview](../AGENTS.md)
- [Agent Specs](../agents-docs/agents/) - Individual agent docs
- [Guard Rails](../agents-docs/guard-rails.md) - Security
- [Coordination](../agents-docs/coordination/) - State tracking
- [Harness](../agents-docs/HARNESS.md) - Orchestration
