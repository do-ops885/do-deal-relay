# PEV Spec: Queues-Based Alert Delivery (F-2)

**Date**: 2026-10-02
**Author**: cline (wave 2 of improvement roadmap)
**Priority**: high
**ADR**: [ADR-032](ADR-032-queues-alert-delivery.md)
**Baseline**: ADR-031 as-built (Queues descoped to inline best-effort), improvement report `reports/analysis/2026-10-02-codebase-improvement-analysis.md` (I-7 / F-2)

## Goal

Move instant alert notification fan-out off the publish-stage hot path onto a Cloudflare Queues consumer with bounded retries and a dead-letter queue, using the already-shipped `alert_deliveries` idempotency table.

## Approach

Add a `deal-alerts` queue (producer binding `ALERT_QUEUE`, optional in `Env`). The matcher enqueues one message per (subscription × matched-deal-batch) when the binding exists and falls back to the current inline send when it does not. A queue consumer in `worker/index.ts` claims delivery via `recordDelivery` (INSERT OR IGNORE idempotency guard) before sending, so redeliveries never double-notify.

## Non-Goals

- Not changing the matcher scoring logic or subscription CRUD.
- Not migrating the high-value-deal webhook path (`notifyHighValueDealsWithWebhook`) — separate follow-up once alert delivery proves out.
- Not migrating the generic outgoing webhook retry path (`lib/webhook/delivery.ts`) — same follow-up.
- Not provisioning the queue in prod (owner/CI operation; code is binding-optional).
- Not changing digest scheduling (`0 9 * * *`); digest notifications ride the same dispatch path.

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Spec + ADR-032 (this document) | plans/ | low |
| 2 | `ALERT_QUEUE?: Queue<AlertDispatchMessage>` in Env (optional, comment why) | worker/types/api.ts | low |
| 3 | Queue producer/consumer config with DLQ | wrangler.jsonc | medium |
| 4 | `lib/alerts/queue.ts`: message type, enqueue-with-fallback, idempotent consumer, DLQ recorder | worker/lib/alerts/queue.ts | medium |
| 5 | Matcher routes through dispatch (queue-first, inline fallback) | worker/lib/alerts/matcher.ts | medium |
| 6 | `queue` handler export in worker entry | worker/index.ts | low |
| 7 | Unit tests for enqueue fallback, idempotent consume, DLQ, matcher dispatch | tests/unit/ | low |
| 8 | GOAP_STATE register entry + analysis-report status update | plans/GOAP_STATE.md, reports/analysis/ | low |

## Acceptance Criteria

- [ ] Publish stage never awaits an outbound HTTP notification when `ALERT_QUEUE` is bound.
- [ ] Without the binding, behavior is byte-identical to today (inline send).
- [ ] Redelivered messages do not double-send (idempotency via `alert_deliveries` PK).
- [ ] Failed deliveries exhaust retries into `deal-alerts-dlq` and are recorded with status `failed`.
- [ ] Unit tests cover: enqueue path, inline fallback, idempotent skip, failure recording, DLQ recording, matcher queue-first dispatch.
- [ ] tsc + prettier + full unit suite green; quality gate passes.
- [ ] EU AI Act Article 12 logging still happens at match-decision time in the matcher.

## Open Questions

- None. Queue naming (`deal-alerts`, DLQ `deal-alerts-dlq`) follows the platform's kebab-case convention; provisioning is deferred to the d1-ops/owner runbook pattern.
