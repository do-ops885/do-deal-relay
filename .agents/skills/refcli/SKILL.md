---
name: refcli
description: Manage referral codes using the refcli command-line tool
version: 1.0.0
author: do-deal-relay
tags: [cli, referral, management, api]
---

# Skill: refcli - Referral Management CLI

## Overview

Use the refcli tool to manage referral codes through the command-line interface. This skill enables adding, deactivating, searching, and researching referral codes.

## Prerequisites

- Node.js installed
- API endpoint accessible (default: http://localhost:8787)

## Quick Start

```bash
# Authenticate
npx ts-node scripts/refcli.ts auth login --endpoint http://localhost:8787

# Add a referral code
npx ts-node scripts/refcli.ts codes add \
  --code ABC123 \
  --url https://example.com/invite/ABC123 \
  --domain example.com

# List active codes
npx ts-node scripts/refcli.ts codes list --status active

# Deactivate a code
npx ts-node scripts/refcli.ts codes deactivate ABC123 --reason expired
```

## Core Commands

### Authentication

```bash
# Login
npx ts-node scripts/refcli.ts auth login --endpoint <url> --key <api_key>

# Check current user
npx ts-node scripts/refcli.ts auth whoami
```

### Code Management

**Add New Code:**

```bash
npx ts-node scripts/refcli.ts codes add \
  --code <code> \
  --url <url> \
  --domain <domain> \
  [--title <title>] \
  [--reward-type <type>] \
  [--reward-value <value>] \
  [--category <cat1,cat2>]
```

**List Codes:**

```bash
npx ts-node scripts/refcli.ts codes list \
  [--status active|inactive|expired] \
  [--domain <domain>] \
  [--limit <n>] \
  [--output table|json|csv|yaml]
```

**Get Code Details:**

```bash
npx ts-node scripts/refcli.ts codes get <code>
```

**Deactivate:**

```bash
npx ts-node scripts/refcli.ts codes deactivate <code> \
  --reason <user_request|expired|invalid|violation|replaced> \
  [--replaced-by <new_code>] \
  [--notes <notes>]
```

**Reactivate:**

```bash
npx ts-node scripts/refcli.ts codes reactivate <code>
```

### Web Research

**Run Research:**

```bash
npx ts-node scripts/refcli.ts research run \
  --domain <domain> \
  [--depth quick|thorough|deep] \
  [--verbose]
```

**View Results:**

```bash
npx ts-node scripts/refcli.ts research results --domain <domain>
```

### System Operations

```bash
# Check health
npx ts-node scripts/refcli.ts system health

# View metrics
npx ts-node scripts/refcli.ts system metrics
```

## Common Patterns

### Add Code with Metadata

```bash
npx ts-node scripts/refcli.ts codes add \
  --code WELCOME2024 \
  --url https://example.com/ref/WELCOME2024 \
  --domain example.com \
  --title "Welcome Bonus" \
  --description "Get $50 when you sign up" \
  --reward-type cash \
  --reward-value 50 \
  --currency USD \
  --category "finance,investment"
```

### Bulk Operations

```bash
# Export all active codes to JSON
npx ts-node scripts/refcli.ts codes list \
  --status active \
  --output json > active_codes.json
```

### Research and Discover

```bash
# Research domain for codes
npx ts-node scripts/refcli.ts research run \
  --domain example.com \
  --depth thorough \
  --verbose
```

## Error Handling

Exit codes:

- **0**: Success
- **1**: General error (invalid arguments, network error)

## API Endpoints

The CLI communicates with:

- `GET /api/referrals` - List/search
- `POST /api/referrals` - Create
- `GET /api/referrals/:code` - Get details
- `POST /api/referrals/:code/deactivate` - Deactivate
- `POST /api/referrals/:code/reactivate` - Reactivate
- `POST /api/research` - Web research
- `GET /api/research/:domain` - Research results

## References

- CLI Implementation: `scripts/refcli.ts`
- API Endpoints: `worker/index.ts`
- Storage Layer: `worker/lib/referral-storage.ts`
- Research Agent: `worker/lib/research-agent.ts`
