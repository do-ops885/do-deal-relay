# Input Methods Swarm Handoff Protocol

**Version: 0.1.1
**Swarm**: input-methods-swarm
**Date**: 2026-04-01

## Overview

This document defines the handoff coordination protocol for implementing the remaining input methods (Browser Extension, Chat Bot, Email Integration, Webhook) using a swarm of agents.

## Agent Responsibilities

### Implementation Agents (Parallel)

| Agent             | Target               | Output Location             | Handoff Target        |
| ----------------- | -------------------- | --------------------------- | --------------------- |
| `extension-agent` | Browser Extension    | `extension/`                | `api-interface-agent` |
| `bot-agent`       | Telegram/Discord Bot | `bot/`                      | `api-interface-agent` |
| `email-agent`     | Email Integration    | `worker/email-handler.ts`   | `api-interface-agent` |
| `webhook-agent`   | Webhook System       | `worker/webhook-handler.ts` | `api-interface-agent` |

### Coordination Agents (Sequential)

| Agent                 | Role            | Input From                | Output To           |
| --------------------- | --------------- | ------------------------- | ------------------- |
| `api-interface-agent` | API Integration | All implementation agents | `validation-agent`  |
| `validation-agent`    | Testing         | `api-interface-agent`     | `synthesis-agent`   |
| `synthesis-agent`     | Aggregation     | `validation-agent`        | Final documentation |

## Phase 1: Setup & Analysis

### Agent: `api-interface-agent` + `synthesis-agent`

**Tasks:**

1. Read existing API documentation (`worker/routes/`, `docs/API.md`)
2. Analyze current referral storage (`worker/lib/referral-storage/`)
3. Document integration points
4. Create handoff template

**Output:** `temp/handoff-setup.md`

**Handoff Content:**

```markdown
# Setup Phase Complete

## API Endpoints Available

- POST /api/referrals - Create referral
- GET /api/referrals/:code - Get referral
- POST /api/research - Web research

## Integration Requirements

- All implementations must use REST API
- Must preserve complete URLs
- Must handle authentication

## Next Phase: Implementation

Implementation agents should:

1. Read this handoff
2. Read their design document (temp/analysis-\*.md)
3. Implement their component
4. Write handoff to api-interface-agent
```

## Phase 2: Parallel Implementation

### Agents Run Simultaneously:

- `extension-agent`
- `bot-agent`
- `email-agent`
- `webhook-agent`

### Each Agent's Tasks:

#### Extension Agent

**Design Doc:** `temp/analysis-extension.md`
**Output:** `extension/` directory
**Handoff File:** `temp/handoff-extension.md`

```markdown
# Browser Extension Implementation Complete

## Files Created

- extension/manifest.json
- extension/content.js
- extension/popup.html
- extension/popup.js
- extension/background.js

## API Integration Points

- POST /api/referrals (smart-add pattern)
- GET /api/referrals/:code

## Testing Instructions

1. Load extension in Chrome developer mode
2. Visit https://picnic.app/de/freunde-rabatt/DOMI6869
3. Click extension icon
4. Verify full URL captured

## Handoff to: api-interface-agent
```

#### Bot Agent

**Design Doc:** `temp/analysis-chatbot.md`
**Output:** `bot/` directory
**Handoff File:** `temp/handoff-bot.md`

```markdown
# Chat Bot Implementation Complete

## Files Created

- bot/telegram/index.ts
- bot/discord/index.ts
- bot/commands.ts
- bot/conversations.ts

## Commands Implemented

- /add <url> - Smart add referral
- /search <domain> - Search referrals
- /deactivate <code> - Deactivate code

## API Integration Points

- All commands use REST API
- Full URL preserved in responses

## Testing Instructions

1. Set TELEGRAM_BOT_TOKEN
2. Run: npm run bot:telegram
3. Send: /add https://picnic.app/de/freunde-rabatt/DOMI6869

## Handoff to: api-interface-agent
```

#### Email Agent

**Design Doc:** `temp/analysis-email.md`
**Output:** `worker/lib/email-handler.ts`
**Handoff File:** `temp/handoff-email.md`

```markdown
# Email Integration Complete

## Files Created

- worker/lib/email-handler.ts
- worker/lib/email-parsers.ts
- worker/routes/email.ts

## Parsing Rules

- 20+ service-specific patterns
- Generic fallback patterns
- Confidence scoring

## API Integration Points

- POST /api/referrals (from parsed emails)
- Full URL extracted from email content

## Testing Instructions

1. Forward referral email to add@your-domain.com
2. Check KV for stored referral
3. Verify full URL preserved

## Handoff to: api-interface-agent
```

#### Webhook Agent

**Design Doc:** `temp/analysis-webhook.md`
**Output:** `worker/lib/webhook-handler.ts`
**Handoff File:** `temp/handoff-webhook.md`

```markdown
# Webhook System Complete

## Files Created

- worker/lib/webhook-handler.ts
- worker/routes/webhooks.ts
- worker/lib/hmac.ts

## Endpoints

- POST /webhooks/incoming/:partner
- POST /webhooks/subscribe
- POST /webhooks/unsubscribe

## Security

- HMAC-SHA256 verification
- Replay attack prevention
- Idempotency keys

## API Integration

- Incoming webhooks → POST /api/referrals
- Outgoing webhooks → Event notifications

## Testing Instructions

1. Register webhook: POST /webhooks/subscribe
2. Send test payload with HMAC
3. Verify referral created with full URL

## Handoff to: api-interface-agent
```

## Phase 3: API Integration

### Agent: `api-interface-agent`

**Input Handoffs:**

- `temp/handoff-extension.md`
- `temp/handoff-bot.md`
- `temp/handoff-email.md`
- `temp/handoff-webhook.md`

**Tasks:**

1. Review all implementation handoffs
2. Verify API integration correctness
3. Check URL preservation in all implementations
4. Create unified integration test

**Output:** `temp/handoff-integration.md`

```markdown
# API Integration Complete

## Implementations Integrated

✓ Browser Extension
✓ Chat Bot
✓ Email Integration
✓ Webhook System

## Integration Tests Passed

- URL preservation: All implementations pass
- API connectivity: All endpoints reachable
- Authentication: All methods handle auth correctly

## Quality Gates

- Schema validation: PASS
- URL preservation: PASS
- Error handling: PASS

## Handoff to: validation-agent
```

## Phase 4: Cross-Platform Validation

### Agent: `validation-agent`

**Tasks:**

1. Run integration tests
2. Test URL preservation across all platforms
3. Test edge cases
4. Security testing

**Test Scenarios:**

```typescript
const testUrls = [
  "https://picnic.app/de/freunde-rabatt/DOMI6869",
  "https://www.trading212.com/invite/ABCDEF123",
  "https://crypto.com/app/XYZ789",
];

// Test each URL through all input methods
// Verify complete URL returned in all responses
```

**Output:** `temp/handoff-validation.md`

```markdown
# Validation Complete

## Test Results

- Extension: PASS (15/15 tests)
- Bot: PASS (12/12 tests)
- Email: PASS (8/8 tests)
- Webhook: PASS (10/10 tests)

## URL Preservation Tests

All implementations correctly preserve complete URLs:
✓ https://picnic.app/de/freunde-rabatt/DOMI6869
✓ https://www.trading212.com/invite/ABCDEF123

## Security Tests

- HMAC verification: PASS
- Rate limiting: PASS
- Input sanitization: PASS

## Handoff to: synthesis-agent
```

## Phase 5: Result Synthesis

### Agent: `synthesis-agent`

**Tasks:**

1. Aggregate all handoffs
2. Update AGENTS.md with new components
3. Update API documentation
4. Create final report

**Output:**

- `temp/swarm-completion-report.md`
- Updated `AGENTS.md`
- Updated `docs/API.md`

```markdown
# Input Methods Swarm - Completion Report

## Implemented Components

### Browser Extension

- Location: extension/
- Features: Auto-detect, capture, bulk import
- Status: Complete

### Chat Bot

- Location: bot/
- Platforms: Telegram, Discord
- Commands: /add, /search, /deactivate, /research
- Status: Complete

### Email Integration

- Location: worker/lib/email-handler.ts
- Features: Forward parsing, command emails, auto-reply
- Status: Complete

### Webhook System

- Location: worker/lib/webhook-handler.ts
- Features: HMAC signed, bidirectional sync, SDK
- Status: Complete

## All Input Methods

| Method            | Status         | Documentation              |
| ----------------- | -------------- | -------------------------- |
| CLI               | ✅ Implemented | temp/analysis-cli.md       |
| Browser Extension | ✅ Implemented | temp/analysis-extension.md |
| Chat Bot          | ✅ Implemented | temp/analysis-chatbot.md   |
| Email             | ✅ Implemented | temp/analysis-email.md     |
| Webhook           | ✅ Implemented | temp/analysis-webhook.md   |

## URL Preservation Verified

All methods correctly preserve and return complete URLs.
```

## Handoff File Format

All agents write to `temp/handoff-{agent-id}.md`:

```markdown
# Handoff: {from_agent} → {to_agent}

## Phase: {phase_name}

## Status: {complete|partial|blocked}

## Timestamp: {ISO8601}

## Summary

- Files created: {count}
- Tests passing: {count}/{total}
- Blockers: {none|description}

## Key Decisions

1. Decision 1
2. Decision 2

## Next Steps for {to_agent}

- [ ] Step 1
- [ ] Step 2

## Relevant Files

- file1
- file2
```

## Coordination Log

All handoffs logged to `agents-docs/coordination/swarm-handoff-log.jsonl`:

```json
{
  "timestamp": "2026-04-01T12:00:00Z",
  "swarm_id": "input-methods-swarm",
  "from_agent": "extension-agent",
  "to_agent": "api-interface-agent",
  "phase": "implementation",
  "status": "complete",
  "handoff_file": "temp/handoff-extension.md"
}
```

## Emergency Procedures

### If Agent Fails

1. Log failure to `temp/handoff-{agent-id}-FAILED.md`
2. Notify synthesis-agent
3. Other agents continue
4. Failed agent retries after fix

### If URL Not Preserved

1. BLOCK all handoffs
2. Log to `temp/blocker-url-preservation.md`
3. Escalate immediately
4. Fix before continuing

### Context Overflow

1. Write minimal handoff: `temp/handoff-minimal.md`
2. Include only: agent_id, status, blocker status
3. Synthesis-agent handles aggregation
