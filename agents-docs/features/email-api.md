# Email API

**Feature**: Email-based referral management with command parsing and security validation
**Version**: 0.1.3
**Status**: Implemented

## Overview

The Email API enables users to manage referral codes via email. It processes incoming emails through a pipeline that validates security, detects commands, extracts referral data, and sends confirmation replies. Supports both command emails (ADD, DEACTIVATE, SEARCH, DIGEST, HELP) and forwarded referral emails from services.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/email/incoming` | Process incoming email (HTTP entry point) |
| POST | `/api/email/parse` | Parse email content without processing |
| GET | `/api/email/help` | Return usage instructions |

The system also runs as a Cloudflare Email Worker (`emailWorkerHandler`) for native email routing.

## Architecture

### Processing Pipeline

1. **Security Validation** — DKIM/SPF checks, rate limiting, spam detection, content validation
2. **Command Detection** — Identifies command type from recipient address or subject prefix
3. **Data Extraction** — Service-specific or generic pattern matching for codes, URLs, rewards, expiry
4. **Command Execution** — ADD, DEACTIVATE, SEARCH, DIGEST, HELP, or forwarded email handling
5. **Reply Generation** — Confirmation, search results, or digest email sent back to sender

### Command Types

| Command | Trigger | Description |
|---------|---------|-------------|
| `ADD` | `add@` recipient or `ADD:` subject | Add a new referral code |
| `DEACTIVATE` | `deactivate@` or `DEACTIVATE:` | Deactivate an existing referral |
| `SEARCH` | `search@` or `SEARCH:` | Search referrals by domain/query |
| `DIGEST` | `digest@` or `DIGEST:` | Get referral digest (daily/weekly/monthly) |
| `HELP` | `help@` or `HELP` subject | Return usage instructions |
| `FORWARDED` | `FW:`, `FWD:`, or referral content | Auto-extract referral from forwarded email |

### Supported Services

Service-specific patterns exist for: Uber, Lyft, Airbnb, Dropbox, Robinhood, Trading212, Crypto.com, Coinbase, Revolut, Rakuten, DoorDash, UberEats, Grubhub, Booking, Expedia, Spotify, Netflix, Discord, Telegram, Headspace, Picnic.

## Configuration

```typescript
const SECURITY_CONFIG = {
  MAX_EMAILS_PER_DAY: 50,
  RATE_LIMIT_WINDOW_HOURS: 24,
  SPAM_THRESHOLD: 0.7,
  WHITELISTED_DOMAINS: ["gmail.com", "outlook.com", "yahoo.com", "icloud.com", "protonmail.com"],
  BLACKLISTED_PATTERNS: [/spam/i, /viagra/i, /lottery/i, /winner/i, /prince/i, /nigerian/i],
};
```

## Security

- **DKIM Validation**: Checks DKIM-Signature header presence
- **SPF Validation**: Checks Received-SPF header for pass/fail
- **Rate Limiting**: 50 emails per sender per day (KV-backed)
- **Spam Detection**: Scoring system (caps, exclamation marks, suspicious URLs, HTML-only, sender patterns)
- **Content Validation**: Min 50 chars, max 10MB, valid sender format
- **XSS Prevention**: Content sanitization (HTML entity encoding)
- **Blacklist**: Per-sender and per-domain blacklist via KV

## Error Handling

| Condition | Response |
|-----------|----------|
| DKIM/SPF failure | Rejected with reason |
| Rate limit exceeded | Rejected with reset time |
| Spam detected | Rejected with spam score |
| Missing service/code | Help email sent back |
| Duplicate code | Error with existing ID |
| Processing error | Error response logged |

## Source Files

| File | Purpose |
|------|---------|
| `worker/email/index.ts` | Module entry point |
| `worker/email/handler.ts` | Re-exports processEmail, emailWorkerHandler |
| `worker/email/handlers/incoming.ts` | Main processing pipeline |
| `worker/email/handlers/commands.ts` | ADD, DEACTIVATE, SEARCH, DIGEST handlers |
| `worker/email/handlers/forwarded.ts` | Forwarded email handling |
| `worker/email/handlers/help.ts` | HELP command handler |
| `worker/email/handlers/parse.ts` | Email parsing |
| `worker/email/extraction.ts` | URL, code, reward, expiry extraction |
| `worker/email/security.ts` | DKIM, SPF, rate limiting, spam detection |
| `worker/email/patterns.ts` | Service-specific referral patterns |
| `worker/email/templates/` | Email response templates |
| `worker/email/types.ts` | TypeScript type definitions |
| `worker/routes/email.ts` | HTTP route handlers |
