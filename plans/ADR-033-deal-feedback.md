# ADR-033: Deal Success-Feedback Loop

**Status**: Proposed → Implemented (slice 1: feedback capture, 2026-10-02; slice 2: bot commands, 2026-10-02)
**Date**: 2026-10-02
**Spec**: [SPEC-deal-feedback.md](SPEC-deal-feedback.md)

## Context

The platform discovers, validates, and ranks deals but never learns whether a
deal actually worked for a user. This is the missing half of the quality
loop: deal freshness is inferred from validation scrapes, not from real
outcomes. The improvement report (F-1) identifies this as the highest-value
net-new feature because ~90% of the infrastructure already exists: D1,
JWT auth, per-code lookups, the trust model, and the compliance logger.

## Decision (slice 1: feedback capture)

1. D1 migration v15 creates `deal_feedback`:
   - `UNIQUE(user_id, referral_code)` — one report per user per code.
   - Upsert semantics (ON CONFLICT DO UPDATE): users may revise their
     outcome instead of being locked to a first impression.
   - `outcome CHECK IN ('success','expired','invalid')` — the report's
     vocabulary; extensible via migration if analytics demand it.
   - `source_channel` (api/bot/...) reserved for the bot-command slice.
2. A D1 helper provides idempotent upsert + per-code aggregation
   (counts + success ratio) for later slices.
3. `POST /api/deals/:code/feedback` (JWT `user` role) validates the body
   with Zod, 404s unknown codes, records the outcome, logs an EU AI Act
   Article 12 operation (`deal_feedback_recorded`), and returns the code's
   feedback stats.

## Deferred slices (explicitly out of scope here)

- Slice 2: **DONE 2026-10-02** — bot commands `/worked <code>`, `/failed <code>`,
  `/expired <code>` (Telegram + Discord) write through the same helper with
  `source_channel: "bot"` via `DealRelayAPI.reportDealFeedback`. As-built
  attribution note: the bot's service API key is the authenticated principal,
  so all bot reports record under the bot service user and re-reports by
  different chat users for the same code revise that row (upsert). Per-chat-user
  attribution needs the same principal-on-behalf-of design as the alert
  subscriptions and is folded into the slice 3 review.
- Slice 3: feeding per-code success ratio into trust evolution
  (`source-registry` DO / `lib/d1/trust.ts`) and ranking (`lib/ranking.ts`) —
  requires a scoring-design review before wiring, since it changes ranking
  behavior (AI-assisted ranking already carries Article 12 obligations). Also
  covers per-user feedback attribution for the bot channel.
- Slice 4: `/metrics` feedback ratios (feedback_ratio, median time).

## Consequences

- Feedback capture deploys with zero behavior change to ranking/trust until
  slice 3 lands deliberately.
- Upsert semantics avoid row duplication while allowing outcome revision.
- Prod D1 migration apply is an owner operation (same runbook as v13/v14);
  the route degrades gracefully until then (D1 errors surface as 5xx, no
  fallback store — honest failure over silent loss).

## Verification

- `tests/unit/deal-feedback.test.ts`: upsert insert-vs-update semantics,
  stats aggregation, route auth/404/400/200 paths, Article 12 logging.
- Full suite green; tsc + prettier clean; quality gate pass.
