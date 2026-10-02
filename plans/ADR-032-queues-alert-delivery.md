# ADR-032: Queues-Based Alert Delivery

**Status**: Proposed → Implemented (2026-10-02)
**Date**: 2026-10-02
**Supersedes**: the Queues descope in ADR-031 (as-built note)
**Spec**: [SPEC-alert-queues-delivery.md](SPEC-alert-queues-delivery.md)

## Context

ADR-031 (personalized deal alerts) shipped with inline best-effort fan-out:
`publish.ts` calls `matchAndNotifySubscriptions` fire-and-forget, and the
matcher awaits `sendAlertNotification` (Telegram/Discord/webhook HTTP calls)
inline. Two problems follow:

1. A slow or failing notification endpoint consumes publish-stage time budget
   (cron wall-clock is capped; the pipeline must never block on fan-out).
2. Inline fire-and-forget has no retry or dead-letter semantics — a transient
   Telegram 5xx silently drops the alert.

Cloudflare Queues is the documented fit for decoupled, idempotent delivery
with bounded retries and a DLQ. Migration v14 (`alert_deliveries` table) was
explicitly built as "the idempotency guard table the queue consumer needs"
(`migrations/0008_alert_deliveries_aiact.sql`), so the storage side already
exists.

## Decision

1. Add a `deal-alerts` queue: producer binding `ALERT_QUEUE` (optional in
   `Env`, mirroring the `RL_*`/`PIPELINE_WORKFLOW` optional-binding pattern),
   consumer with `max_retries: 3` and dead-letter queue `deal-alerts-dlq`.
2. The matcher enqueues one serializable message per (subscription × matched
   batch) with a deterministic `alertId = subscription_id + digest(deal ids)`.
   When the binding is absent (local/test/staging without the queue), it
   falls back to the existing inline send — byte-identical behavior.
3. The consumer (exported as the `queue` handler on the Worker) claims the
   delivery first via `recordDelivery` (INSERT OR IGNORE on the
   `(alert_id, subscription_id)` PK). First claim proceeds to
   `sendAlertNotification`; redeliveries claim nothing and ack as duplicates.
4. Failure after retries lands in the DLQ consumer, which records status
   `failed` in `alert_deliveries` and logs with full context.
5. EU AI Act Article 12 logging stays at match-decision time in the matcher
   (decision logging is separate from delivery outcome).

## Consequences

- Publish-stage latency becomes independent of notification endpoints.
- Alert delivery gains at-least-once semantics with idempotent dedupe.
- `alert_deliveries` becomes a real delivery ledger (sent/failed/skipped).
- Queue provisioning is a follow-up owner operation (binding-optional code
  deploys safely before the queue exists).
- The generic webhook retry path (`lib/webhook/delivery.ts`) remains a
  separate future migration candidate once this proves out in production.

## Verification

- `tests/unit/alerts-queue.test.ts`: enqueue path, inline fallback,
  idempotent duplicate skip, failure recording, DLQ recording,
  matcher queue-first dispatch.
- Full suite green (3017+ new tests), tsc + prettier clean, quality gate pass.
