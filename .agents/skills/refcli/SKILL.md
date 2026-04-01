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

# Add a code with smart-parse
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# Or add manually
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

# Smart-add a referral URL
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869
```

## Smart Add (Auto-Parse URL)

The easiest way to add a referral - just paste the URL:

```bash
npx ts-node scripts/refcli.ts codes smart-add <referral-url>
```

**Examples:**

```bash
# Picnic referral
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# Trading212 invite
npx ts-node scripts/refcli.ts codes smart-add https://www.trading212.com/invite/GcCOCxbo

# Crypto.com
npx ts-node scripts/refcli.ts codes smart-add https://crypto.com/app/ABC123
```

**Smart Add extracts:**

- Domain from hostname (e.g., picnic.app)
- Code from last path segment (e.g., DOMI6869)
- Full URL for storage

## Core Commands

### Auth

```bash
npx ts-node scripts/refcli.ts auth login --endpoint <url> [--key <api_key>]
npx ts-node scripts/refcli.ts auth whoami
```

### Code Management

**Smart Add (Recommended):**

```bash
npx ts-node scripts/refcli.ts codes smart-add <referral-url>
```

**Manual Add:**

```bash
npx ts-node scripts/refcli.ts codes add \
  --code <code> --url <url> --domain <domain> \
  [--title <title>] [--reward-type <type>] [--category <cats>]
```

**List:**

```bash
npx ts-node scripts/refcli.ts codes list \
  [--status active|inactive|expired] \
  [--domain <domain>] [--output table|json|csv|yaml]
```

**Get:**

```bash
npx ts-node scripts/refcli.ts codes get <code>
```

**Deactivate:**

```bash
npx ts-node scripts/refcli.ts codes deactivate <code> \
  --reason <user_request|expired|invalid|violation|replaced>
```

**Reactivate:**

```bash
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

## Examples

### Quick Add with URL

```bash
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869
```

### Full Metadata Add

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
