# Deal Discovery System

[![CI](https://github.com/do-ops885/do-deal-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/do-ops885/do-deal-relay/actions/workflows/ci.yml)
[![Security](https://github.com/do-ops885/do-deal-relay/actions/workflows/security.yml/badge.svg)](https://github.com/do-ops885/do-deal-relay/actions/workflows/security.yml)
[![Nightly](https://github.com/do-ops885/do-deal-relay/actions/workflows/nightly.yml/badge.svg)](https://github.com/do-ops885/do-deal-relay/actions/workflows/nightly.yml)

**Version**: 0.1.3 | **Status**: Active / Testing

Autonomous AI-agent deal discovery system on Cloudflare Workers.

## Quick Start

### Prerequisites

- Node.js 22.x
- npm
- Wrangler CLI (`npm install -g wrangler`)

### Setup

```bash
npm install
```

### Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Build TypeScript |
| `npm run typecheck` | Type check only |
| `npm run test` | Run tests with coverage |
| `npm run test:e2e` | Run E2E tests (Playwright) |
| `npm run lint` | Type check + format check |
| `npm run lint:fix` | Type check + auto-fix formatting |
| `npm run validate` | Run validation gates |
| `npm run verify` | Run full local validation (pre-push) |
| `npm run deploy` | Deploy to production |

### For AI Agents

```bash
curl https://your-worker.workers.dev/deals       # Active deals
curl https://your-worker.workers.dev/deals.json   # Full snapshot
curl https://your-worker.workers.dev/health       # Health check
curl https://your-worker.workers.dev/api/log      # Recent logs
```

## Documentation

- [AGENTS.md](AGENTS.md) — System specs and architecture
- [docs/API.md](docs/API.md) — API reference
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) — Optimization playbook
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines
- [SECURITY.md](SECURITY.md) — Security policy

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

## Safety & Quality

- **9 Validation Gates**: Per-deal integrity checks (schema, trust, dedupe, etc.)
- **12 Quality Gates**: System-wide CI/CD checks (tests, lint, security, audit)

## CI/CD Pipeline

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| CI | Push/PR | Type check, format, tests, E2E, security scan, build |
| Security | Push/PR + Daily | Secret detection, dependency audit |
| Nightly | Daily 3 AM UTC | Full test suite + load tests |
| Deploy Staging | Push to develop | Deploy to staging environment |
| Deploy Production | Push to main + tags | Deploy to production with verification |
| Canary | Manual | Canary releases with traffic splitting |
| Rollback | Manual | Emergency rollback to previous version |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEALS_PROD` | Yes | KV namespace for deal storage |
| `DEALS_LOG` | Yes | KV namespace for metrics |
| `DEALS_STAGING` | Yes | KV namespace for staging deals |
| `DEALS_LOCK` | Yes | KV namespace for distributed locking |
| `DEALS_SOURCES` | Yes | KV namespace for source registry |
| `AI_GATEWAY_URL` | Yes | AI Gateway URL |
| `TRUST_THRESHOLD` | Yes | Minimum trust score (0.0–1.0) |
| `ENVIRONMENT` | No | Deployment environment |
| `DEALS_DB` | No | D1 Database for persistent storage |
| `GITHUB_TOKEN` | No | GitHub PAT for repository operations |
| `CANDIDATE_BUDGET_GLOBAL` | No | Max candidates per run |
| `EMAIL_WEBHOOK_SECRET` | No | Secret for incoming email verification |

### Current Settings

- **Cron**: Every 6 hours
- **KV Namespaces**: 5 (PROD, STAGING, LOG, LOCK, SOURCES)
- **Max Deals**: 1000 per run
- **Trust Threshold**: Dev 0.1 / Staging 0.25 / Prod 0.3
- **High Value**: > $100

## Safety Features

- Two-phase publish (staging → production)
- 9 validation gates
- Distributed locking
- Idempotency checks
- Automatic rollback

## Monitoring

Check `/metrics` endpoint for:

- Total runs and success rate
- Deal counts (discovered, validated, published)
- Stage latency histograms
- Validation cache hits/misses

## Support

1. Check `/health` endpoint
2. Review logs via `/api/log`
3. Open GitHub Issue with `trace_id`
