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
3. Matcher runs at publish on the new-deal batch only, on the
   free-tier path: D1 FTS5 plus precomputed subscription-query
   embeddings with in-worker cosine match (zero Vectorize queries at
   publish — per-subscription Vectorize queries exceed the free
   queried-dimensions budget). Strict `score >= threshold` parity
   with shared helpers. Emits `deal_alert_match` via
   `logAIInteraction` (hashed query, no PII). Vectorize stays
   reserved for interactive `/api/semantic-search` and `/api/nlq`.
4. Cloudflare Queues for fan-out (free since 2026-02-04, 10k
   ops/day): `ALERT_QUEUE` producer + consumer with DLQ,
   `alert_deliveries(alert_id, subscription_id)` unique idempotency
   guard, `instant` enqueues immediately while `daily-digest`
   accumulates in D1 keyed by run date for the `0 9 * * *` cron
   drain. Hard caps: `MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH = 500`,
   `MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH = 10` with digest
   rollover (never silent drop); payload is IDs only. Binding
   missing or budget exhausted falls back to inline best-effort
   plus the existing KV-DLQ.
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

## Addendum — free-tier compliance (2026-09-17)

Audited against official `developers.cloudflare.com` pricing/limits
pages. Workers, KV, D1, Durable Objects (SQLite), Workflows
(default-off), Workers AI (embeddings are neuron-trivial), AI
Gateway, and 4 crons all FIT free. Queues FITS only under the caps
above (about 3.3k messages/day at 3 ops each; worst case 500 msgs x
4 publishes = 6k ops/day with headroom for retries). KV writes
(1k/day) are the tightest budget: digest and DLQ rows live in D1,
KV-DLQ is overflow only; log per batch, never per message; prod
observability sampling lowered to 0.1; cron count frozen at 4.

Open uncertainties (no guessing): Vectorize free availability is
self-contradictory across official pages (dashboard check required;
D1-FTS5 path is the default until confirmed); rate-limit binding
free quota is unpublished (KV fallback stays primary on free);
free cron CPU (10 ms) needs one dashboard check before matcher load
lands.

## Verification

- `npx tsc --noEmit` clean, full unit suite green, `./scripts/quality_gate.sh` exit 0.
- Migration v13 forward and rollback covered; CRUD RBAC matrix covered.
- Matcher parity, idempotent redelivery, digest drain timing covered.
