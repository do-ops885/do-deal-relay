# Deal Discovery System

[![Version](https://img.shields.io/badge/version-0.2.0-blue)](VERSION)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](package.json)

**Autonomous deal discovery system with coordinated AI agents, MCP protocol, and 9 validation gates.**

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Wrangler CLI (`npm install -g wrangler`)

### Setup

```bash
# Install dependencies
npm install

# Run quality gate (silent on success)
./scripts/quality_gate.sh

# Run tests with coverage
npm test -- --coverage

# Start development server
npm run dev
```

### For AI Agents

```bash
# Get all active deals
curl https://your-worker.workers.dev/deals

# Get full snapshot
curl https://your-worker.workers.dev/deals.json

# Check health
curl https://your-worker.workers.dev/health

# Access MCP server
curl https://your-worker.workers.dev/mcp
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Discovery  │────▶│  Validation │────▶│   Publish   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Sources    │     │  9 Gates    │     │  GitHub     │
└─────────────┘     └─────────────┘     └─────────────┘
```

**State Machine**: `init → discover → normalize → dedupe → validate → score → stage → publish → verify → finalize`

**Infrastructure**: Cloudflare Workers + 5 KV namespaces + D1 Database with FTS5

**Schedule**: Every 6 hours via cron trigger

## Key Features

| Feature | Status | Documentation |
|---------|--------|---------------|
| MCP Server (2025-11-25) | ✅ Complete | [docs/MCP.md](docs/MCP.md) |
| D1 Database + FTS5 | ✅ Complete | `/api/d1/*` endpoints |
| 9 Validation Gates | ✅ Complete | [agents-docs/guard-rails.md](agents-docs/guard-rails.md) |
| Two-Phase Publish | ✅ Complete | Staging → Production |
| Webhook System | ✅ Complete | [worker/routes/webhooks-README.md](worker/routes/webhooks-README.md) |
| Email Integration | ✅ Complete | `/api/email/*` endpoints |
| Expiration Automation | ✅ Complete | Scheduled validation sweeps |
| Real Web Research | ✅ Complete | ProductHunt, GitHub, HN, Reddit APIs |

## Documentation

| Document | Description |
|----------|-------------|
| [AGENTS.md](AGENTS.md) | **Start here** - System specs, agent registry, skills |
| [docs/API.md](docs/API.md) | REST & MCP endpoint reference |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide |
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | Quick start tutorial |
| [agents-docs/AGENTS_REGISTRY.md](agents-docs/AGENTS_REGISTRY.md) | Complete agent & skill catalog |
| [agents-docs/GUARD_RAILS.md](agents-docs/GUARD_RAILS.md) | Local pre-commit/pre-push hooks |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |
| [SECURITY.md](SECURITY.md) | Security policy |

## Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build TypeScript |
| `npm test` | Run tests in watch mode |
| `npm run test:ci` | Run tests once (for CI) |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Type check |
| `npm run validate` | Run validation gates |
| `npm run format` | Format code with Prettier |

### Quality Gates

Run `./scripts/quality_gate.sh` before every commit:

- ✅ TypeScript compilation (strict mode)
- ✅ Unit tests (80% coverage threshold)
- ✅ Validation gates (9 checks)
- ✅ Security scans (secrets, vulnerabilities)
- ✅ File organization (root directory policy)

### Pre-Commit Hooks

```bash
# Install git hooks (run once after clone)
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
cp scripts/pre-push-hook.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```

**Pre-commit** (10 gates): Secrets detection, file size limits, syntax validation  
**Pre-push** (9 gates): TypeScript compilation, full test suite, security audit

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Cron Schedule | Every 6 hours | Automated deal discovery runs |
| KV Namespaces | 5 | PROD, STAGING, LOG, LOCK, SOURCES |
| Max Deals | 1000 per run | Pipeline throughput limit |
| Trust Threshold | 0.3 | Minimum score for publication |
| High Value | > $100 | Deals flagged as high-value |
| Coverage Threshold | 80% lines, 75% functions | Enforced in CI |

## Safety Features

- **Two-Phase Publish**: Staging environment validates before production
- **9 Validation Gates**: URL, duplicate, trust, value, expiration checks
- **Distributed Locking**: Prevents race conditions across workers
- **Idempotency Checks**: Safe retry on failures
- **Automatic Rollback**: Failed deployments auto-revert
- **Circuit Breakers**: GitHub, external API protection

## Monitoring

Check `/metrics` endpoint for Prometheus-format metrics:

- Total pipeline runs
- Success/failure rates
- Deal counts by status
- Validation gate failures
- Response times (p50, p95, p99)

## Support

For issues:

1. Check `/health` endpoint for system status
2. Review logs via `/api/log?limit=100`
3. Search [agents-docs/KNOWN_ISSUES.md](agents-docs/KNOWN_ISSUES.md)
4. Open GitHub Issue with `trace_id` from logs

## License

MIT - See [LICENSE](LICENSE) file
