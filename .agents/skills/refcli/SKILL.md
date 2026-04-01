---
name: refcli
description: Manage referral codes via CLI with Cloudflare Workers
version: 1.0.0
author: do-deal-relay
tags: [cli, referral, cloudflare, wrangler]
---

# Skill: refcli - Referral Management CLI

## Overview

Manage referral codes via CLI with Cloudflare Workers. Supports local dev and production deployments.

## Prerequisites

- Node.js installed
- Wrangler CLI: `npm install -g wrangler`

## Quick Start

### Local Development

```bash
# Terminal 1: Start dev server
wrangler dev

# Terminal 2: Configure CLI
npx ts-node scripts/refcli.ts auth login --endpoint http://localhost:8787

# Add a code
npx ts-node scripts/refcli.ts codes add \
  --code ABC123 \
  --url https://example.com/invite/ABC123 \
  --domain example.com
```

### Production

```bash
# Deploy
wrangler deploy

# Configure for production
npx ts-node scripts/refcli.ts auth login \
  --endpoint https://do-deal-relay.YOUR_SUBDOMAIN.workers.dev

# List codes
npx ts-node scripts/refcli.ts codes list --status active
```

## Core Commands

### Auth

```bash
npx ts-node scripts/refcli.ts auth login --endpoint <url> [--key <api_key>]
npx ts-node scripts/refcli.ts auth whoami
```

### Code Management

```bash
# Add
npx ts-node scripts/refcli.ts codes add \
  --code <code> --url <url> --domain <domain> \
  [--title <title>] [--reward-type <type>] [--category <cats>]

# List
npx ts-node scripts/refcli.ts codes list \
  [--status active|inactive|expired] \
  [--domain <domain>] [--output table|json|csv|yaml]

# Get
npx ts-node scripts/refcli.ts codes get <code>

# Deactivate
npx ts-node scripts/refcli.ts codes deactivate <code> \
  --reason <user_request|expired|invalid|violation|replaced> \
  [--replaced-by <new_code>]

# Reactivate
npx ts-node scripts/refcli.ts codes reactivate <code>
```

### Web Research

```bash
npx ts-node scripts/refcli.ts research run \
  --domain <domain> [--depth quick|thorough|deep]

npx ts-node scripts/refcli.ts research results --domain <domain>
```

### System

```bash
npx ts-node scripts/refcli.ts system health
npx ts-node scripts/refcli.ts system metrics
```

## Wrangler Workflow

```bash
# Development
wrangler dev                      # Local server at localhost:8787

# Deployment
wrangler deploy                   # Production
wrangler deploy --env staging     # Staging

# Logs
wrangler tail                     # Stream logs

# KV
wrangler kv list --binding DEALS_SOURCES
```

## Examples

### Full Code Add

```bash
npx ts-node scripts/refcli.ts codes add \
  --code WELCOME2024 \
  --url https://example.com/ref/WELCOME2024 \
  --domain example.com \
  --title "Welcome Bonus" \
  --reward-type cash \
  --reward-value 50 \
  --currency USD \
  --category "finance,investment"
```

### Export Active Codes

```bash
npx ts-node scripts/refcli.ts codes list \
  --status active --output json > codes.json
```

### Research Domain

```bash
npx ts-node scripts/refcli.ts research run \
  --domain trading212.com --depth thorough
```

## API Endpoints

- `GET /api/referrals` - List/search
- `POST /api/referrals` - Create
- `GET /api/referrals/:code` - Get details
- `POST /api/referrals/:code/deactivate` - Deactivate
- `POST /api/referrals/:code/reactivate` - Reactivate
- `POST /api/research` - Web research
- `GET /api/research/:domain` - Research results

## Troubleshooting

| Issue              | Solution                                   |
| ------------------ | ------------------------------------------ |
| Connection refused | Ensure `wrangler dev` is running           |
| KV errors          | Check KV IDs in `wrangler.toml`            |
| Deploy fails       | Run `wrangler deploy --dry-run` to preview |

## References

- CLI: `scripts/refcli.ts`
- API: `worker/index.ts`
- Config: `wrangler.toml`
- Docs: https://developers.cloudflare.com/workers/
