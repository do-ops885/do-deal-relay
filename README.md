# Deal Discovery System

**System**: Production Ready  
**Version**: 0.1.1  
**Status**: Stable (259 tests passing)  
**Deployment**: Cloudflare Workers

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Wrangler CLI (`npm install -g wrangler`)

### Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Deploy locally
npm run dev

# Deploy to production
npm run deploy
```

### For AI Agents

```bash
# Get all active deals
curl https://your-worker.workers.dev/deals

# Get full snapshot
curl https://your-worker.workers.dev/deals.json

# Check health
curl https://your-worker.workers.dev/health

# Get Prometheus metrics
curl https://your-worker.workers.dev/metrics

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

**Status**: Production-ready with comprehensive test coverage

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

### Input Methods

- **API** - REST endpoints for deal management
- **CLI** - TypeScript CLI for administration
- **Browser Extension** - Chrome extension for capturing referrals
- **Discord Bot** - Community deal submission
- **Telegram Bot** - Alternative chat interface
- **Email** - Ingestion via email parsing
- **Webhooks** - Partner integrations

### Pipeline Phases

1. **Discover** - Crawl configured sources for new deals
2. **Normalize** - Standardize deal format and metadata
3. **Dedupe** - Filter duplicates by code + source
4. **Validate** - 9 validation gates for quality
5. **Score** - Calculate trust and value scores
6. **Stage** - Prepare atomic snapshot
7. **Publish** - Two-phase commit (staging → production)
8. **Verify** - Post-publish validation
9. **Finalize** - Complete and notify

## Current Configuration

- **Cron Schedule**: Every 6 hours
- **KV Namespaces**: 7 (PROD, STAGING, LOG, LOCK, SOURCES, REFERRALS, WEBHOOKS)
- **Max Deals**: 1000 per run
- **Trust Threshold**: 0.3
- **High Value**: > $100
- **Test Coverage**: 259 tests, 100% passing
- **API Authentication**: API key auth for administrative endpoints

## Development Roadmap

### ✅ Phase 1: Bootstrap (Completed)

- [x] Core pipeline implementation
- [x] KV storage layer
- [x] TypeScript type system
- [x] Basic test infrastructure

### ✅ Phase 2: Test & Validation (Completed)

- [x] 259 comprehensive tests
- [x] All validation gates passing
- [x] Quality gate automation
- [x] CI/CD pipeline

### ✅ Phase 3: Production Readiness (Completed)

- [x] GitHub integration
- [x] Cloudflare Workers deployment
- [x] Security audit (XSS fixes, API auth)
- [x] Multi-agent skill system
- [x] Complete input methods (API, CLI, Extension, Bot, Email, Webhook)

### 🚧 Phase 4: Enhancement (In Progress)

- [ ] Load testing suite
- [ ] Performance optimization
- [ ] Advanced analytics dashboard
- [ ] Machine learning for deal scoring

## Agent Tools / API Endpoints

- `GET /deals` - Retrieve active deals with filtering
- `GET /deals.json` - Get full snapshot with metadata
- `GET /api/referrals` - List referral codes with search
- `POST /api/referrals` - Create new referral
- `GET /api/referrals/:code` - Get specific referral
- `POST /api/referrals/:code/deactivate` - Deactivate referral
- `POST /api/discover` - Trigger discovery pipeline
- `GET /api/status` - Pipeline status
- `GET /api/log` - Recent pipeline logs
- `POST /api/submit` - Submit new deal
- `GET /health` - System health check
- `GET /metrics` - Prometheus-compatible metrics

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
