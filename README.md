# Deal Discovery System - Status

**System**: Active / Production
**Version**: 0.1.3
![Coverage](https://img.shields.io/badge/Coverage-80%25-green.svg)
**Status**: Active / Production
**Deployments**: 166+ production deploys

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare Skills (`npx skills add https://github.com/cloudflare/skills`)

### Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Deploy locally
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

# Get recent logs
curl https://your-worker.workers.dev/api/log
```

### Documentation

- [AGENTS.md](AGENTS.md) - System specs and architecture
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) - Optimization playbook
- [docs/API.md](docs/API.md) - API reference
<!-- - [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide (Coming Soon) -->
<!-- - [docs/LEGAL_COMPLIANCE.md](docs/LEGAL_COMPLIANCE.md) - Legal requirements (Coming Soon) -->
- **Status Dashboard**: Check `/health` endpoint

## Architecture

**Status**: Active / Production

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

## Development Roadmap

### Phase 1: Bootstrap

- [x] Fix test infrastructure ✅
- [x] Install missing dependencies ✅
- [x] Validate core types ✅
- [x] Basic KV storage layer ✅

### Phase 2: Test & Validate

- [x] Write comprehensive tests ✅
- [x] Run validation gates ✅
- [x] Fix failing checks ✅
- [x] Achieve >80% coverage ✅

### Phase 3: Deploy

- [x] Configure GitHub integration ✅
- [x] Set up Cloudflare Workers ✅
- [x] Deploy to staging ✅
- [ ] Production release (v1.0.0)

## Configuration

### Required Environment Variables

The system requires the following environment variables to be set for the Worker to start:

- `DEALS_KV`: KV namespace for deal storage.
- `METRICS_KV`: KV namespace for metrics data.
- `AI_GATEWAY_URL`: URL for the AI Gateway (e.g., Cloudflare AI Gateway).
- `TRUST_THRESHOLD`: Minimum trust score for deals (0.0 to 1.0).

### Optional Configuration

- `ENVIRONMENT`: Deployment environment (development, staging, production).
- `GITHUB_REPO`: Target repository for publishing.
- `GITHUB_TOKEN`: GitHub API token for publishing.
- `NOTIFICATION_THRESHOLD`: Minimum value for high-value deal notifications.
- `CANDIDATE_BUDGET_GLOBAL`: Maximum candidates to process per run.

## Current Configuration

- **Cron Schedule**: Every 6 hours
- **KV Namespaces**: 5 (PROD, STAGING, LOG, LOCK, SOURCES)
- **Max Deals**: 1000 per run
- **Trust Threshold**: Environment-specific (Dev: 0.1, Staging: 0.25, Prod: 0.3)
- **High Value**: > $100

## Agent Tools

- `get_deals` - Retrieve active deals
- `get_deal_by_code` - Find specific code
- `submit_deal` - Submit new discovery

## Safety Features

- Two-phase publish (staging → production)
- 9 validation gates
- Distributed locking
- Idempotency checks
- Automatic rollback

## Monitoring

Check `/metrics` for:

- Total runs and success rate
- Deal counts (discovered, validated, published)
- **Stage Latency**: Histograms for discovery, validation, and publish stages
- **Bottleneck Analysis**: Timing breakdown by success/failure status
- Validation cache hits/misses

## Support

For issues:

1. Check `/health` endpoint
2. Review logs via `/api/log`
3. Open GitHub Issue with trace_id
