# Webhook System

**Feature**: Bidirectional webhook integration for partner referrals with delivery guarantees
**Version**: 0.1.3
**Status**: Implemented

## Overview

The Webhook System enables external partners to push referral data via incoming webhooks and subscribe to outgoing webhook events. Features include HMAC signature verification, exponential backoff retries, dead letter queue, idempotency, and bidirectional sync support.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/incoming/:partnerId` | Receive referral data from partners |
| POST | `/api/webhooks/subscribe` | Create webhook subscription |
| DELETE | `/api/webhooks/unsubscribe/:id` | Remove webhook subscription |
| GET | `/api/webhooks/subscriptions` | List all subscriptions |
| GET | `/api/webhooks/partners` | List registered partners |
| GET | `/api/webhooks/dlq` | View dead letter queue |
| POST | `/api/webhooks/dlq/:eventId/:subId/retry` | Retry failed delivery |
| POST | `/api/webhooks/sync` | Create sync configuration |
| GET | `/api/webhooks/sync/:partnerId` | Get sync state |
| POST | `/api/webhooks/sync/:partnerId/trigger` | Trigger manual sync |

## Architecture

### Incoming Webhooks

Partners send referral data with HMAC-SHA256 signed payloads. Processing flow:

1. **Partner Validation** — Verify partner exists and is active
2. **Rate Limiting** — Per-partner limit (default 60 req/min)
3. **Idempotency Check** — Prevent duplicate processing via hashed key
4. **Signature Verification** — HMAC-SHA256 with timestamp validation
5. **Payload Processing** — Create/update/deactivate referrals based on event type
6. **Outgoing Webhooks** — Trigger subscriptions for `referral.created` events

### Outgoing Webhooks

Events dispatched to subscribed partner endpoints with retry guarantees.

### Event Types

| Event | Direction | Description |
|-------|-----------|-------------|
| `referral.created` | Both | New referral added |
| `referral.updated` | Incoming | Existing referral modified |
| `referral.deactivated` | Both | Referral deactivated |
| `referral.expired` | Incoming | Referral expired |
| `referral.validated` | Outgoing | Referral passed validation |
| `referral.quarantined` | Outgoing | Referral quarantined |
| `ping` | Incoming | Connectivity test |

### Retry Policy

```typescript
const DEFAULT_RETRY_POLICY = {
  max_attempts: 5,
  initial_delay_ms: 1000,
  max_delay_ms: 60000,
  backoff_multiplier: 2, // Exponential: 1s, 2s, 4s, 8s, 16s + jitter
};
```

Jitter (0–1000ms) prevents thundering herd. Failed deliveries after max attempts go to the dead letter queue (30-day retention).

### Idempotency

Partners can send `X-Idempotency-Key` header. The system hashes the key and payload, caching results for 24 hours. Conflicting payloads with the same key are rejected.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `max_attempts` | 5 | Max delivery retries |
| `initial_delay_ms` | 1000 | Initial retry delay |
| `max_delay_ms` | 60000 | Max retry delay cap |
| `backoff_multiplier` | 2 | Exponential factor |
| `rate_limit_per_minute` | 60 | Per-partner rate limit |
| `DLQ retention` | 30 days | Dead letter queue TTL |
| `Delivery record TTL` | 7 days | KV delivery record expiry |

## Error Handling

| Condition | Status | Response |
|-----------|--------|----------|
| Unknown partner | 401 | "Unknown partner" |
| Partner deactivated | 403 | "Partner deactivated" |
| Rate limit exceeded | 429 | Retry-After header |
| Invalid signature | 401 | "Invalid signature" |
| Invalid JSON | 400 | "Invalid JSON payload" |
| Event not allowed | 400 | "Event type not allowed" |
| Missing required fields | 400 | "Missing required fields" |
| Idempotency conflict | 400 | "Idempotency key conflict" |
| Duplicate event | 200 | "Already processed" |

## Source Files

| File | Purpose |
|------|---------|
| `worker/lib/webhook/index.ts` | Module entry point |
| `worker/lib/webhook/types.ts` | Type definitions and constants |
| `worker/lib/webhook/incoming.ts` | Incoming webhook processing |
| `worker/lib/webhook/delivery.ts` | Outgoing delivery and retry logic |
| `worker/lib/webhook/subscriptions.ts` | Partner and subscription management |
| `worker/routes/webhooks/index.ts` | Route registration |
| `worker/routes/webhooks/incoming.ts` | Incoming webhook route |
| `worker/routes/webhooks/subscriptions.ts` | Subscription management routes |
| `worker/routes/webhooks/sync.ts` | Bidirectional sync routes |
