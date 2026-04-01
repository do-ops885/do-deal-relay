# Deal Discovery System - Status

**System**: In Development
**Version**: 0.1.1
**Status**: Bootstrap Phase

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

- [AGENTS.md](AGENTS.md) - Agent coordination and system specs
- [QUICKSTART.md](QUICKSTART.md) - 5-minute getting started guide
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [SECURITY.md](SECURITY.md) - Security policy
- [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) - System architecture
- **Status Dashboard**: Check `/health` endpoint

## Architecture

**Status**: In design/implementation phase. Not yet deployed.

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

### Phase 1: Bootstrap (Current - v0.1.1)

- [ ] Fix test infrastructure
- [ ] Install missing dependencies
- [ ] Validate core types
- [ ] Basic KV storage layer

### Phase 2: Test & Validate

- [ ] Write comprehensive tests
- [ ] Run validation gates
- [ ] Fix failing checks
- [ ] Achieve >80% coverage

### Phase 3: Deploy

- [ ] Configure GitHub integration
- [ ] Set up Cloudflare Workers
- [ ] Deploy to staging
- [ ] Production release (v1.0.0)

## Current Configuration

- **Cron Schedule**: Every 6 hours
- **KV Namespaces**: 5 (PROD, STAGING, LOG, LOCK, SOURCES)
- **Max Deals**: 1000 per run
- **Trust Threshold**: 0.3
- **High Value**: > $100

## Agent Tools

- `get_deals` - Retrieve active deals
- `get_deal_by_code` - Find specific code
- `submit_deal` - Submit new discovery

## Available Scripts

- `./scripts/quality_gate.sh` - Run all validation gates
- `./scripts/validate-codes.sh` - Validate deal codes
- `./scripts/setup-skills.sh` - Setup agent skills

## Skills System

The project uses a comprehensive skill system in `.agents/skills/`:

- **Agent Coordination**: `agent-coordination`, `parallel-execution`, `goap-agent`
- **Cloudflare**: `cloudflare`, `wrangler`, `durable-objects`, `workers-best-practices`
- **Security**: `guard-rails`, `privacy-first`, `validation-gates`
- **Development**: `pre-commit`, `skill-creator`, `shell-script-quality`

See `.agents/skills/README.md` for the full catalog.

## Safety Features

- Two-phase publish (staging → production)
- 9 validation gates
- Distributed locking
- Idempotency checks
- Automatic rollback

## Monitoring

Check `/metrics` for:

- Total runs
- Success rate
- Deal counts
- Validation failures

## Support

For issues:

1. Check `/health` endpoint
2. Review logs via `/api/log`
3. Open GitHub Issue with trace_id
