# ADR-031: Personalized Deal Alerts via Queues Fan-Out (2026-09-16)

**Date**: 2026-09-16
**Status**: Proposed
**Related**: SPEC-deal-alerts-764.md, issue #764
**Branch**: feat/deal-alerts-764-spec

## Context

All alert inputs are complete: NLQ saved queries (D1 `nlq_saved_queries`,
`worker/lib/d1/nlq-saved.ts`), hybrid search (`worker/lib/search/`),
notification senders (telegram in `worker/notify.ts`, webhooks in
`worker/lib/webhook/delivery.ts` with KV-emulated DLQ), expiry digest
grouping precedent, and EU AI Act logging (`logAIInteraction`). Missing:
`alert_subscriptions` storage, publish-stage matcher, durable fan-out,
digest accumulation, discord and email outbound senders.

Current webhook retry blocks the worker (`sleep(backoff)` in
`delivery.ts`) and DLQ is KV-emulated. There are no `queues` in
`wrangler.jsonc`, no `Queue` binding in `Env`, and no `queue()` export.

## Decision

1. D1 `alert_subscriptions` migration v13 with dual write (raw SQL
   `migrations/0007_alert_subscriptions.sql` + runtime `version: 13`):
   `id`, `user_id` FK `users(id)` cascade, `saved_query_id` FK
   `nlq_saved_queries(id)` cascade, `channel` check
   (`telegram`, `discord`, `email`, `webhook`), `threshold` real
   `0..1`, `frequency` check (`instant`, `daily-digest`), `active`
   integer `0/1`, `last_sent_at`, `created_at`, `updated_at`; indexes
   on `(user_id, active)`, `(saved_query_id)`, `(frequency, active)`;
   `updated_at` trigger mirroring `schema-part-6.ts`.
2. CRUD under `/api/nlq/alerts` with existing `withAuth(user)` outer
   gate plus inner `authenticateRequest` owner check, mirroring
   `worker/routes/nlq/saved.ts`. Zod validation only; deal gates
   untouched. Owner-scoped `WHERE user_id = ?`; `saved_query_id`
   validated via existing `getSavedQuery`.
3. Matcher runs at publish on the new-deal batch only: each active
   subscription evaluated via hybrid search, strict `score >=
   threshold` parity with shared helpers. Emits `deal_alert_match`
   via `logAIInteraction` (hashed query, no PII).
4. Cloudflare Queues for fan-out: `ALERT_QUEUE` producer + consumer
   with DLQ, `alert_deliveries(alert_id, subscription_id)` unique
   idempotency guard, `instant` enqueues immediately while
   `daily-digest` accumulates for the `0 9 * * *` cron drain.
5. `Sender` interface per channel; reuse telegram and webhook paths
   via `validatedFetch`; new discord webhook sender via
   `validatedFetch`; outbound email behind env provider binding
   (provider chosen before step 5). No channel secrets in D1 or logs.

## Consequences

Positive:

- Publish stays fast; sends retry independently with DLQ instead of
  blocking the worker.
- RBAC and compliance reuse proven patterns; audit surface is one new
  op type.
- Digest and instant share one matcher; no policy drift.

Negative / accepted:

- New Queues bindings require plan availability check; fallback is
  inline best-effort with warn if binding missing.
- Discord and email senders are new code; mitigated by shared sender
  tests plus `validatedFetch` SSRF coverage.
- One more D1 table and cron responsibility; bounded by per-user cap
  constant and batch-only matching.

## Verification

- `npx tsc --noEmit` clean, full unit suite green, `./scripts/quality_gate.sh` exit 0.
- Migration v13 forward and rollback covered; CRUD RBAC matrix covered.
- Matcher parity, idempotent redelivery, digest drain timing covered.
