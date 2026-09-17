# PEV Spec — personalized deal alerts (issue #764)

## Task

**Title**: Saved-search subscriptions with instant and daily-digest delivery
**Author**: opencode
**Date**: 2026-09-16
**Priority**: high

## Goal

Users save an NLQ query once and get notified via telegram, discord,
email, or webhook when a newly published deal batch matches at or above
their threshold.

## Approach

Wire existing primitives instead of building new ones: D1
`alert_subscriptions` + CRUD API (user role, mirroring `/api/nlq/saved`),
publish-stage matcher over the new-deal batch only via hybrid search,
Cloudflare Queues fan-out with DLQ and idempotent consumer, daily digest
on the existing `0 9 * * *` cron, EU AI Act logging via
`logAIInteraction`.

## Non-Goals

Explicitly state what we are NOT doing:

- [ ] Not touching the 9-gate deal validation pipeline (`worker/validation/pipeline.ts` unchanged; CRUD uses Zod only)
- [ ] Not rewriting `notify.ts`, webhook delivery retry policy, or expiry digest grouping (reuse as-is)
- [ ] Not adding per-deal workflow steps or touching `PipelineWorkflow` / shadow workflows
- [ ] Not removing the legacy pipeline path or PipelineLock (transition period per ADR-018)
- [ ] Not storing raw PII in AI Act logs (hash only, per existing compliance pattern)

## Steps

Decompose into the smallest steps that each leave the repo green:

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Migration v13 + D1 lib: `alert_subscriptions` table, indexes, trigger; `alert-subscriptions.ts` lib mirroring `nlq-saved.ts` | migrations/0007_alert_subscriptions.sql, worker/lib/d1/migrations/schema-part-6.ts, worker/lib/d1/migrations/schema.ts, worker/lib/d1/alert-subscriptions.ts, tests/unit/d1/alert-subscriptions.test.ts, tests/unit/d1/migrations.*.test.ts fixtures | low |
| 2 | CRUD API (user role): `POST/GET /api/nlq/alerts`, `GET/PATCH/DELETE /api/nlq/alerts/:id`; Zod schemas; owner scoping; rate limit; 503 `MIGRATION_PENDING` pattern | worker/routes/nlq/alerts.ts, worker/routes/nlq/index.ts, worker/lib/rate-limit-config.ts, tests/unit/nlq/alerts.test.ts, docs/API.md, agents-docs/features/nlq-api.md | medium |
| 3 | Publish-stage matcher: new-deal batch x active subscriptions via hybrid search, `score >= threshold`; shared threshold helpers; `deal_alert_match` compliance event | worker/lib/alerts/matcher.ts, worker/publish.ts, worker/routes/nlq/utils.ts, tests/unit/alerts/matcher.test.ts | medium |
| 4 | Queues fan-out: `ALERT_QUEUE` producer + consumer + DLQ in wrangler; `Env` binding; `queue()` export in index; idempotent `alert_deliveries` guard; instant vs digest split | wrangler.jsonc, worker/types/api.ts, worker/index.ts, worker/queues/alert-consumer.ts, worker/lib/d1/alert-deliveries.ts, tests/unit/queues/alert-consumer.test.ts | medium |
| 5 | Channels + digest + bots: `Sender` interface; reuse telegram + webhook; new discord webhook sender via `validatedFetch`; outbound email provider binding; digest accumulator drained by `0 9 * * *` cron; bot subscribe/unsubscribe/list commands | worker/lib/alerts/senders.ts, worker/scheduled.ts, bot/discord/commands.ts, bot/telegram (as applicable), worker/email/* (outbound only), tests/unit/alerts/senders.test.ts | medium |
| 6 | Full verification, docs, e2e: authenticated user + admin-bypass paths; migration v13 e2e; close-out GOAP + ADR status | tests/e2e/alerts.spec.ts, docs/API.md, plans/GOAP_STATE.md, plans/ADR-031-deal-alerts.md | low |

## Acceptance Criteria

Concrete, testable statements the Verify phase will check:

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test:unit` green including new alerts, queues, matcher suites
- [ ] `./scripts/quality_gate.sh` exits 0, no file over 500 lines
- [ ] `npm run lint:md` clean for spec, ADR, API docs
- [ ] Migration v13 applies forward and rolls back; `latestVersion == 13` fixtures pass
- [ ] CRUD requires user role; `admin` bypasses; cross-user access returns 404; `saved_query_id` validated against owner via `getSavedQuery`
- [ ] Matcher runs on new-deal batch only; `score >= threshold` strict parity with shared helpers; zero sends on empty batch
- [ ] Queue consumer is idempotent (duplicate delivery skipped); DLQ receives poison messages after max retries
- [ ] Digest subscriptions accumulate and drain only on `0 9 * * *` cron; instant subscriptions enqueue immediately
- [ ] `deal_alert_match` compliance event emitted via `logAIInteraction` with hashed query only
- [ ] Outbound telegram, discord, webhook sends use `validatedFetch` (SSRF checks); no hardcoded secrets or channel credentials
- [ ] Existing tests still pass (no regression)

## Open Questions

If ambiguous, surface here instead of guessing:

- [ ] Discord delivery shape: per-subscription incoming webhook URL vs bot DM? Proposed: stored webhook URL per subscription, sent via `validatedFetch` (needs SSRF allowlist decision).
- [ ] Outbound email provider: Resend, MailChannels, or SendGrid? Proposed: provider behind env binding; spec PR decides before step 5.
- [ ] Per-user subscription cap: mirror `MAX_SAVED_PER_USER = 50` or lower (e.g. 20)? Proposed: 20 with named constant.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fan-out storm on large publish batch | high | Matcher capped to new-deal batch; per-subscription early exit on threshold; queue decouples publish from send; binding missing falls back to inline best-effort with warn |
| Duplicate sends on queue retry | medium | `alert_deliveries(alert_id, subscription_id)` unique guard; consumer acks only after guard insert; DLQ after max retries |
| Channel credential leak | high | No secrets in D1; webhook URLs treated as secrets (never logged); `validatedFetch` per-hop checks; env-sourced provider keys only |
| Digest vs instant drift | medium | Single matcher with frequency split at enqueue time; digest accumulator namespaced by run date; cron drains by date key |
| Scope creep into validation pipeline | low | CRUD uses Zod only; deal gates untouched and pinned by existing tests |

## Dependencies

- [ ] CI passing on main (verified 2026-09-16 via `scripts/check-ci-status.sh`)
- [ ] #763 closed (ADR-018 Completed, GOAP v0.19.23) — present on main
- [ ] Queues availability on Workers plan (prod rollout flag if needed)

## Out of Scope for This Spec

- Legacy pipeline removal + PipelineLock retirement (separate follow-up)
- Discord inbound bot rewrite (commands only, existing client unchanged)
- Semantic-search filter changes (matcher reuses current hybrid path)
