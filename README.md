# Deal Discovery System - Status

**System**: Active  
**Version**: 1.0.0  
**Last Updated**: 2024-03-31

## Quick Start

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

### For Humans
- **Repository**: https://github.com/do-ops885/do-deal-relay
- **Documentation**: 
  - [AGENTS.md](AGENTS.md) - System specs and architecture
  - [docs/API.md](docs/API.md) - API reference
  - [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide
  - [docs/LEGAL_COMPLIANCE.md](docs/LEGAL_COMPLIANCE.md) - Legal requirements
- **Status Dashboard**: Check `/health` endpoint

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
