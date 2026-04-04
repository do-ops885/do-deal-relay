# User Input Methods

**Status**: All Methods Implemented
**Last Updated**: 2026-04-02
**Swarm Analysis**: Completed by 6 parallel agents

## Overview

A swarm of 6 agents analyzed all possibilities for user input to the referral management system. All 6 input methods have been successfully implemented.

## Input Methods Summary

| Method                | Status                  | Document                     | Key Features                              |
| --------------------- | ----------------------- | ---------------------------- | ----------------------------------------- |
| **CLI**               | ✅ Implemented          | `temp/analysis-cli.md`       | oclif-based, auth, CRUD, import, research |
| **Web UI/API**        | ✅ API Done, UI Planned | `temp/analysis-web-ui.md`    | React + Vite, JWT auth, dashboard         |
| **Browser Extension** | ✅ Implemented          | `temp/analysis-extension.md` | MV3, auto-detect, context menu            |
| **Chat Bot**          | ✅ Implemented          | `temp/analysis-chatbot.md`   | Telegram/Discord, slash commands          |
| **Email Integration** | ✅ Implemented          | `temp/analysis-email.md`     | Forward parsing, command emails           |
| **Webhook/API**       | ✅ Implemented          | `temp/analysis-webhook.md`   | HMAC signed, bidirectional sync           |

**All input methods are now implemented!** Focus is now on optimization and production readiness.

## Quick Start Examples

### CLI

```bash
# Install dependencies
npm install

# Validate all systems
./scripts/quality_gate.sh

# Run test suite
npm run test:ci

# Start development
npm run dev

# CLI Tool for Referral Management
npx ts-node scripts/cli/index.ts --help
npx ts-node scripts/cli/index.ts auth login --endpoint http://localhost:8787
npx ts-node scripts/cli/index.ts codes add --code ABC123 --url https://example.com/invite/ABC123 --domain example.com
npx ts-node scripts/cli/index.ts codes deactivate ABC123 --reason expired
```

### Web API

```bash
# List referrals
curl http://localhost:8787/api/referrals

# Create referral
curl -X POST http://localhost:8787/api/referrals \
  -H "Content-Type: application/json" \
  -d '{"code": "ABC123", "url": "https://example.com/invite/ABC123", "domain": "example.com"}'

# Deactivate referral
curl -X POST http://localhost:8787/api/referrals/ABC123/deactivate \
  -H "Content-Type: application/json" \
  -d '{"reason": "expired"}'
```

### Webhook

```bash
# Webhook with HMAC signature
curl -X POST http://localhost:8787/webhooks/referral \
  -H "Content-Type: application/json" \
  -H "X-Signature: <hmac-signature>" \
  -d '{"event": "referral.created", "data": {...}}'
```

## Architecture

All input methods converge to the same core referral storage and processing pipeline:

```
┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  ┌─────────────┐
│    CLI      │  │ Web UI/API   │  │ Browser         │  │ Chat Bot    │
│  (oclif)    │  │ (React/API)  │  │ Extension       │  │ (Telegram)  │
└──────┬──────┘  └──────┬───────┘  └────────┬────────┘  └──────┬──────┘
       │                │                    │                  │
       └────────────────┴────────────────────┴──────────────────┘
                                      │
                              ┌───────▼────────┐
                              │  API Gateway   │
                              └───────┬────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
           ┌────────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
           │ Referral Storage│ │  Research   │ │   Validation    │
           │   (KV-based)    │ │    Agent    │ │     Gates       │
           └─────────────────┘ └─────────────┘ └─────────────────┘
```

## Related Documentation

| Resource                 | Location                                                        |
| ------------------------ | --------------------------------------------------------------- |
| CLI Documentation        | [temp/analysis-cli.md](../../temp/analysis-cli.md)              |
| Web UI/API Design        | [temp/analysis-web-ui.md](../../temp/analysis-web-ui.md)        |
| Browser Extension Design | [temp/analysis-extension.md](../../temp/analysis-extension.md)  |
| Chat Bot Design          | [temp/analysis-chatbot.md](../../temp/analysis-chatbot.md)      |
| Email Integration Design | [temp/analysis-email.md](../../temp/analysis-email.md)          |
| Webhook/API Design       | [temp/analysis-webhook.md](../../temp/analysis-webhook.md)      |
| Referral System          | [agents-docs/features/referral-system.md](./referral-system.md) |
