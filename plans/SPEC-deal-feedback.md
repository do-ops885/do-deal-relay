# PEV Spec: Deal Success-Feedback Loop — F-1 (Slice 1: Feedback Capture)

**Date**: 2026-10-02
**Author**: cline (wave 3 of improvement roadmap)
**Priority**: high
**ADR**: [ADR-033](ADR-033-deal-feedback.md)
**Baseline**: `reports/analysis/2026-10-02-codebase-improvement-analysis.md` (F-1)

## Goal

Let authenticated users report whether a deal worked, store outcomes durably
in D1, and expose per-code feedback statistics — the data foundation that
later slices feed into trust evolution and ranking.

## Approach

Add D1 migration v15 (`deal_feedback` table, UNIQUE(user_id, referral_code)
with upsert semantics so users can revise their report) plus a D1 helper, and
a JWT-protected `POST /api/deals/:code/feedback` route following the
existing `handleValidateDeal` route pattern, with EU AI Act Article 12
logging at record time.

## Non-Goals

- Not feeding trust evolution or ranking yet (slice 3 — requires score
  design review; this slice only exposes the stats helper).
- Not adding bot commands (`/worked`, `/failed`) yet (slice 2).
- Not adding `/metrics` ratios yet (slice 4).
- Not migrating the D1 schema in prod (owner ops runbook, same as v13/v14).

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Spec + ADR-033 | plans/ | low |
| 2 | Migration v15 `deal_feedback` (runtime + SQL mirror) | schema-part-9.ts, schema.ts, migrations/0009 | low |
| 3 | D1 helper: upsert record + per-code stats | worker/lib/d1/deal-feedback.ts, d1/index.ts | low |
| 4 | Route handler + wiring (zod body, 404 unknown code, Article 12 log) | worker/routes/core/deal-feedback.ts, router/legacy-routes.ts | medium |
| 5 | Unit tests (upsert, stats, route validation, compliance log) | tests/unit/ | low |
| 6 | GOAP register + report status + CHANGELOG | plans/, reports/, CHANGELOG.md | low |

## Acceptance Criteria

- [ ] `POST /api/deals/:code/feedback` requires JWT `user` role (401 without).
- [ ] Unknown code returns 404; invalid outcome returns Zod 400.
- [ ] Same user re-submitting the same code updates the outcome (upsert), not
      a duplicate row.
- [ ] Per-code stats derive success ratio from recorded outcomes.
- [ ] EU AI Act Article 12 operation logged at record time.
- [ ] tsc + prettier + full unit suite green; quality gate passes.

## Open Questions

- None blocking. Outcome vocabulary (`success|expired|invalid`) follows the
  report design; `source_channel` defaults to `api` and is extensible for the
  bot slice.
