---
name: refcli
description: Manage referral codes via CLI - FULL URL ALWAYS RETURNED
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
version: 1.0.0
author: do-deal-relay
tags: [cli, referral, cloudflare, wrangler]
---

# Skill: refcli - Referral Management CLI

## CRITICAL RULES

### 1. PRESERVE COMPLETE LINKS (Input)

**ALWAYS use the COMPLETE link as provided. NEVER modify or shorten the URL.**

```bash
# [CORRECT] Full link preserved exactly
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# [WRONG] Never use partial URLs
npx ts-node scripts/refcli.ts codes smart-add picnic.app/DOMI6869  # NEVER DO THIS
```

### 2. FULL URL ALWAYS RETURNED (Output)

**When querying the system, the COMPLETE URL is always returned in the `url` field.**

```json
{
  "referral": {
    "id": "ref-abc123",
    "code": "DOMI6869",
    "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
    "domain": "picnic.app"
  }
}
```

**All API responses include the full URL:**

- `GET /api/referrals` - Each referral has complete `url` field
- `GET /api/referrals/:code` - Returns referral with full `url`
- `POST /api/referrals` - Created referral includes full `url`
- `POST /api/referrals/:code/deactivate` - Deactivated referral includes full `url`
- `POST /api/referrals/:code/reactivate` - Reactivated referral includes full `url`

## Quick Start

### Local Development

```bash
# Start dev server
wrangler dev

# Add with COMPLETE link
npx ts-node scripts/refcli.ts auth login --endpoint http://localhost:8787
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# Query returns FULL URL
npx ts-node scripts/refcli.ts codes get DOMI6869
# Output includes: "url": "https://picnic.app/de/freunde-rabatt/DOMI6869"
```

### Production

```bash
wrangler deploy
npx ts-node scripts/refcli.ts auth login \
  --endpoint https://do-deal-relay.YOUR_SUBDOMAIN.workers.dev
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869
```

## Smart Add

Auto-parse while preserving complete URL:

```bash
npx ts-node scripts/refcli.ts codes smart-add <complete-referral-url>
```

**Stores:**

- `url`: Complete link (e.g., `https://picnic.app/de/freunde-rabatt/DOMI6869`)
- `domain`: Extracted (e.g., `picnic.app`)
- `code`: Last path segment (e.g., `DOMI6869`)

## Commands

### Auth

```bash
npx ts-node scripts/refcli.ts auth login --endpoint <url>
npx ts-node scripts/refcli.ts auth whoami
```

### Code Management

```bash
# Add with auto-parse
npx ts-node scripts/refcli.ts codes smart-add <complete-url>

# Manual add
npx ts-node scripts/refcli.ts codes add \
  --code <code> --url <complete-url> --domain <domain>

# List (returns referrals with full urls)
npx ts-node scripts/refcli.ts codes list [--status active]

# Get single (returns full url)
npx ts-node scripts/refcli.ts codes get <code>

# Deactivate (returns full url)
npx ts-node scripts/refcli.ts codes deactivate <code> --reason <reason>

# Reactivate (returns full url)
npx ts-node scripts/refcli.ts codes reactivate <code>
```

### Research

```bash
npx ts-node scripts/refcli.ts research run --domain <domain>
npx ts-node scripts/refcli.ts research results --domain <domain>
```

## API Response Format

All referral objects include the **complete URL**:

```json
{
  "id": "ref-xxx",
  "code": "ABC123",
  "url": "https://example.com/full/path/ABC123",
  "domain": "example.com",
  "status": "active",
  "metadata": {
    "title": "Example Referral"
  }
}
```

## Wrangler Commands

```bash
wrangler dev
wrangler deploy
wrangler tail
```

## References

- CLI: `scripts/refcli.ts`
- API: `worker/index.ts`
- Config: `wrangler.toml`
