# Webhook System

**Feature**: Bidirectional webhook integration for partner referrals with delivery guarantees
**Version**: 0.1.9
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

Events are dispatched to subscribed partner endpoints with durable retry guarantees.

1. **Subscription Match** — Active subscriptions are filtered by event type, domain, and status.
2. **Durable Enqueue** — The producer persists a `pending` delivery record (keyed by the stable `eventId:subscriptionId` identity) and enqueues one `WEBHOOK_QUEUE` message per subscription. The request/pipeline path returns without waiting on subscriber network calls or retry backoff.
3. **Consumer Delivery** — `worker/queues/webhook-consumer.ts` performs one attempt per message. Delivered identities are acked immediately on redelivery (duplicate suppression); transient failures call `retry()` under the queue's bounded retry budget; permanent failures and exhausted retries are acked and written to the DLQ.
4. **Inline Fallback** — Without a `WEBHOOK_QUEUE` binding (local, tests, oversized batches over 100 subscribers) delivery runs inline with the same retry policy and DLQ semantics.

Queue configuration (`wrangler.jsonc`): producer `WEBHOOK_QUEUE` → `webhook-queue`, consumer batch 10, timeout 5s, 5 retries, DLQ `webhook-queue-dlq`.

### DLQ Replay

`POST /api/webhooks/dlq/:eventId/:subId/retry` replays a failed delivery without notifying twice: an already-delivered identity is dropped, a queue-bound deployment re-enqueues the original delivery ID, and an inline deployment performs one bounded attempt. Entries that still fail remain inspectable in the DLQ.

### Delivery Metrics

Structured logs always, plus best-effort `system_metrics` rows when D1 is bound:

| Metric | Type | Description |
|--------|------|-------------|
| `webhook_enqueue_total` | counter | Enqueued deliveries |
| `webhook_enqueue_latency_ms` | histogram | Producer enqueue latency |
| `webhook_delivery_total` | counter | Terminal deliveries by status |
| `webhook_delivery_latency_ms` | histogram | Attempt latency by status |
| `webhook_retry_total` | counter | Retried attempts |
| `webhook_dlq_depth` | gauge | DLQ entries after add/remove |
| `webhook_queue_alert_total` | counter | Raised queue health alerts by kind |

### Queue Health and Alerts

`worker/lib/webhook/health.ts` scores a bounded snapshot of delivery records and the DLQ against explicit thresholds, and is surfaced in two places:

- the `*/30 * * * *` cron logs a warning and increments `webhook_queue_alert_total` per breached threshold;
- the admin `/metrics` surface returns the snapshot as `webhook_queue` JSON and as Prometheus gauges (`webhook_queue_dlq_depth`, `webhook_queue_retry_rate`, `webhook_queue_oldest_pending_seconds`, `webhook_queue_alerts_active`).

| Threshold | Value | Alert kind |
|-----------|-------|------------|
| DLQ depth | >= 1 | `dlq_depth` (status `critical`) |
| Retry rate | > 0.2 of a >= 5 delivery sample active in the last 30 minutes | `retry_rate` |
| Oldest pending age | >= 15 minutes | `pending_age` |

The retry-rate alert ignores samples below `MIN_SAMPLE_SIZE`, so a single retried message never pages anyone. Its sample is also windowed to the last 30 minutes: delivery records live for 7 days, so counting their full history would keep yesterday's retries alerting today. Pending age is measured for every pending record regardless of age.

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
| `worker/lib/webhook/delivery.ts` | Outgoing dispatch, queue producer, inline fallback |
| `worker/lib/webhook/attempt.ts` | Single delivery attempt, backoff, delivery constants |
| `worker/lib/webhook/records.ts` | Delivery record persistence and lookup |
| `worker/lib/webhook/dlq.ts` | Dead letter queue and idempotent replay |
| `worker/lib/webhook/queue.ts` | Queue message contract and delivery identity |
| `worker/lib/webhook/metrics.ts` | Webhook delivery metrics |
| `worker/lib/webhook/health.ts` | Queue thresholds, health snapshot, Prometheus gauges |
| `worker/queues/webhook-consumer.ts` | `webhook-queue` consumer |
| `worker/lib/webhook/subscriptions.ts` | Partner and subscription management |
| `worker/routes/webhooks/index.ts` | Route registration |
| `worker/routes/webhooks/incoming.ts` | Incoming webhook route |
| `worker/routes/webhooks/subscriptions.ts` | Subscription management routes |
| `worker/routes/webhooks/sync.ts` | Bidirectional sync routes |
