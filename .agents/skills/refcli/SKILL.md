---
name: refcli
description: Manage referral codes via CLI with Cloudflare Workers - PRESERVE COMPLETE LINKS
version: 1.0.0
author: do-deal-relay
tags: [cli, referral, cloudflare, wrangler]
---

# Skill: refcli - Referral Management CLI

## Overview

CLI tool for managing referral codes in Cloudflare Workers. Extracts code and domain metadata while **always preserving the complete URL exactly as provided**.

## CRITICAL RULE: PRESERVE COMPLETE LINKS

**ALWAYS use the COMPLETE link as provided. NEVER modify or shorten the URL.**

### Correct Usage:

```bash
# [CORRECT] Full link preserved exactly as provided
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# [CORRECT] Result stores: https://picnic.app/de/freunde-rabatt/DOMI6869
```

### Incorrect (DO NOT DO):

```bash
# [WRONG] Never use shortened or partial URLs
npx ts-node scripts/refcli.ts codes smart-add picnic.app/DOMI6869
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/DOMI6869
```

## Quick Start

### Local Development

```bash
# Terminal 1: Start dev server
wrangler dev

# Terminal 2: Add a code with COMPLETE link
npx ts-node scripts/refcli.ts auth login --endpoint http://localhost:8787
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869
```

### Production

```bash
wrangler deploy
npx ts-node scripts/refcli.ts auth login \
  --endpoint https://do-deal-relay.YOUR_SUBDOMAIN.workers.dev
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869
```

## Smart Add (Auto-Parse)

The smart-add command extracts metadata while **preserving the complete URL**:

```bash
npx ts-node scripts/refcli.ts codes smart-add <full-referral-url>
```

**What gets stored:**

- **URL**: Complete link exactly as provided (e.g., `https://picnic.app/de/freunde-rabatt/DOMI6869`)
- **Domain**: Extracted from hostname (e.g., `picnic.app`)
- **Code**: Last path segment (e.g., `DOMI6869`)

### Examples with COMPLETE Links:

```bash
# Picnic (German referral)
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# Trading212
npx ts-node scripts/refcli.ts codes smart-add https://www.trading212.com/invite/GcCOCxbo

# Crypto.com
npx ts-node scripts/refcli.ts codes smart-add https://crypto.com/app/ABC123

# Airbnb
npx ts-node scripts/refcli.ts codes smart-add https://www.airbnb.com/c/somecode123
```

## Core Commands

### Auth

```bash
npx ts-node scripts/refcli.ts auth login --endpoint <url> [--key <api_key>]
npx ts-node scripts/refcli.ts auth whoami
```

### Smart Add (Recommended)

```bash
npx ts-node scripts/refcli.ts codes smart-add <complete-referral-url>
```

### Manual Add (when metadata needed)

```bash
npx ts-node scripts/refcli.ts codes add \
  --code <code> \
  --url <complete-url> \
  --domain <domain> \
  [--title <title>] \
  [--reward-type <type>]
```

### List Codes

```bash
npx ts-node scripts/refcli.ts codes list \
  [--status active|inactive|expired] \
  [--domain <domain>]
```

### Deactivate

```bash
npx ts-node scripts/refcli.ts codes deactivate <code> \
  --reason <user_request|expired|invalid|violation|replaced>
```

## Wrangler Commands

```bash
# Development
wrangler dev                      # Local server at localhost:8787

# Deployment
wrangler deploy                   # Production
wrangler deploy --env staging     # Staging

# Logs
wrangler tail                     # Stream logs
```

## References

- CLI: `scripts/refcli.ts`
- API: `worker/index.ts`
- Config: `wrangler.toml`
- Cloudflare Docs: https://developers.cloudflare.com/workers/
