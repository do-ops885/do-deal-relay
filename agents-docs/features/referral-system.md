# Referral Management System (v0.1.2)

**Version**: v0.1.2
**Status**: Implemented
**Last Updated**: 2026-04-02

## Overview

The Referral Management System is a comprehensive multi-input platform for discovering, storing, and managing referral codes across various domains. It supports ingestion via CLI, API, Browser Extension, Chat Bot, Email, and Webhooks.

## New Features

- **Multi-Input Referral System**: CLI, API, Browser Extension, Chat Bot, Email, Webhooks
- **Web Research Agent**: Automatically discovers referral codes from ProductHunt, GitHub, HN, Reddit
- **Swarm Coordination**: Parallel agent execution with handoff protocol
- **Code Lifecycle Management**: Add, activate, deactivate, reactivate with reason tracking
- **Comprehensive Storage**: KV-based with indices for code, domain, status

## Components

| Component        | Location                                                     | Purpose                          |
| ---------------- | ------------------------------------------------------------ | -------------------------------- |
| Referral Types   | `worker/types.ts`                                            | ReferralInput, Research schemas  |
| Referral Storage | `worker/lib/referral-storage/`                               | CRUD, search, deactivate         |
| Research Agent   | `worker/lib/research-agent/`                                 | Web discovery of codes           |
| API Endpoints    | `worker/routes/`                                             | REST API for referral management |
| CLI Tool         | `scripts/cli/`                                               | Command-line interface           |
| Swarm Config     | `agents-docs/coordination/input-methods-swarm-config.json`   | Agent orchestration              |
| Handoff Protocol | `agents-docs/coordination/input-methods-handoff-protocol.md` | Coordination rules               |

## API Endpoints

```
GET    /api/referrals           # List/search referrals
POST   /api/referrals           # Create new referral
GET    /api/referrals/:code     # Get specific referral
POST   /api/referrals/:code/deactivate  # Deactivate with reason
POST   /api/referrals/:code/reactivate  # Reactivate
POST   /api/research            # Execute web research
GET    /api/research/:domain    # Get research results
```

## URL Handling

URL preservation is critical for referral codes. See [URL Handling Rules](../url-handling.md) for complete guidelines.

**Key Points:**

- Always use complete URLs when adding codes
- API always returns full URLs in the `url` field
- Never truncate or modify URLs in agent communication

## Research Integration

The Research Agent automatically discovers referral codes from multiple sources:

**Sources**: ProductHunt, GitHub Trending, Hacker News, RSS feeds, Reddit.

**Research Command**:

```bash
# Via CLI
npx ts-node scripts/refcli.ts research run --domain example.com --depth thorough

# Via API
curl -X POST http://localhost:8787/api/research \
  -H "Content-Type: application/json" \
  -d '{"query": "example referral code", "domain": "example.com", "depth": "thorough"}'

# Via Agent
skill goap-agent
research-task: "Find all referral codes for domain X"
output: temp/research-*.md
```

**Integration Points**: Research → `temp/research-*.md` → Deal extraction pipeline → Update `worker/sources/`.

**Research Agent**: `worker/lib/research-agent/` - Multi-source discovery, confidence scoring, result storage.

## Swarm Coordination

The Referral Management System uses specialized swarm patterns for efficient processing:

### Pattern 4: Referral Management Swarm

See `agents-docs/coordination/referral-swarm-config.json`

- **Parallel**: 6 interface agents (CLI, API, Extension, Bot, Email, Webhook)
- **Sequential**: Ingestion → Research → Validation → Deactivation → Synthesis
- **Quality Gates**: Schema validation, duplicate check, trust score

## Related Documentation

| Resource                  | Location                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| System Architecture       | [agents-docs/SYSTEM_REFERENCE.md](../SYSTEM_REFERENCE.md)                                             |
| Referral Handoff Protocol | [agents-docs/coordination/referral-handoff-protocol.md](../coordination/referral-handoff-protocol.md) |
| Input Methods             | [agents-docs/features/input-methods.md](./input-methods.md)                                           |
| API Documentation         | [docs/API.md](../../docs/API.md)                                                                      |
| CLI Documentation         | [temp/analysis-cli.md](../../temp/analysis-cli.md)                                                    |
| Web UI/API Design         | [temp/analysis-web-ui.md](../../temp/analysis-web-ui.md)                                              |
| Browser Extension Design  | [temp/analysis-extension.md](../../temp/analysis-extension.md)                                        |
| Chat Bot Design           | [temp/analysis-chatbot.md](../../temp/analysis-chatbot.md)                                            |
| Email Integration Design  | [temp/analysis-email.md](../../temp/analysis-email.md)                                                |
| Webhook/API Design        | [temp/analysis-webhook.md](../../temp/analysis-webhook.md)                                            |
