# Codebase Improvement & Feature Analysis — 2026-10-02

**Date**: 2026-10-02
**Repo state**: `main @ aa8ba5a`, VERSION 0.1.8, GOAP_STATE v0.19.31 (queue empty)
**Method**: Static verification of prior backlog claims (GAP-ANALYSIS-2026-08-15,
improvement-swarm-2026-09-06, GOAP_STATE register) against current code, plus
dead-export tracing, config/binding inspection, and skills-library review.
**Scope**: (1) verified backlog state, (2) open improvements, (3) new feature
proposals, (4) skills-library distillation findings.

---

## Executive Summary

All five major items flagged in the 2026-09-06 swarm (MF-2 real fetchers, MI-2
scraper registry, RL-1 rate-limit race, Workflows wiring, #764 deal alerts) are
**DONE and verified in code** — the improvement queue is genuinely empty. What
remains falls into three buckets:

| Bucket | Count | Character |
|:---|:---:|:---|
| Open hygiene/code items | 4 | 500-line violations, dead exports, `as any` residue, logging split |
| Deferred (operator-gated) | 5 | N-3 logging migration, F-4 DO cutover, R-6 AI Gateway, P3-17 OTEL, Queues descope |
| Owner-blocked | 4 | prod D1 v13/v14 apply, CI-1 secret (ADR-023), REDDIT-6 creds, prod seeding |

The highest-leverage next work is therefore **new features**, not fixes. Two
features stand out as "mostly wiring" like the alerts feature was: a **deal
success-feedback loop** and **Queues-backed delivery**. Details below.

---

## Part 1 — Verified Backlog State (evidence-based)

| Prior item | Verdict | Evidence |
|:---|:---|:---|
| MF-2 research agent simulated | DONE | `orchestrator/index.ts:13` imports real `fetchFromSource`; gated by `real_research_fetching` flag (`orchestrator/index.ts:66-88`); `simulateDiscovery` reachable only via test-only flag (`:352-353`) |
| MI-2 scraper registry unwired | DONE | `createDefaultScraperRegistry` at `orchestrator/index.ts:30,102`; `AIExtractorScraper` via `extractWithAI()` (`:332-339`) |
| RL-1 rate-limit race | DONE | Native `ratelimits` bindings in `wrangler.jsonc:190-226`; binding-first path `rate-limit.ts:96-103`; KV fallback only for 300s windows (ADR-028) |
| Workflows migration | DONE (flag-gated) | Bindings `wrangler.jsonc:143-155`; dispatch via `maybeTriggerPipelineWorkflow` (`scheduled.ts:169-179`), `workflow_pipeline_cutover` default-off; shadow workflow at `scheduled.ts:209` |
| #764 deal alerts | DONE | `worker/lib/alerts/{matcher,notifier}.ts`; instant fan-out in `publish.ts:139-150`; daily digest `scheduled.ts:69-83`; v13/v14 migrations |
| Hybrid semantic search (MF-1) | DONE | `semantic-search.ts:25` fuses FTS5 + Vectorize via RRF (`lib/search/hybrid.ts`) |
| TODO/FIXME markers | CLEAN | Zero open markers in `worker/**/*.ts` |

---

## Part 2 — Open Improvements (actionable now)

### I-1: File-size violations of the 500-line constraint — P2, Light Mode
- `worker/routes/auth.ts` — **565 lines**
- `worker/lib/rate-limit.ts` — **517 lines** (`worker/lib/validation/url-validator.ts` is at exactly 500 — split opportunistically on next touch)

Fix: extract pure helpers (auth: token-issuance/verification split;
rate-limit: KV-fallback path into `rate-limit-binding.ts` sibling). Atomic PRs,
no behavior change.

### I-2: Dead exports (test-only consumers) — P3, Light Mode
- `worker/lib/cache.ts:285-317,328-378` — `createSourceCache`, `createRobotsTxtCache`, `createSnapshotCache`, `createStagingSnapshotCache`, and all aggregate metrics/reset helpers have zero non-test importers.
- `worker/lib/similarity.ts:8-10,46` — exported weight constants and `countOverlap` used only internally + tests.
- `worker/lib/rate-limit.ts:152` — `checkRateLimitKV` has no non-test consumers.
- `worker/lib/research-agent/index.ts:87` — re-exports `simulateDiscovery` (test-only path).

Fix: un-export or delete; where deletion is right (cache factory family),
verify no dynamic import first. This mirrors the MI-5/MI-6 pattern: **built,
tested, but bypassed code invites drift** — the repo's recurring failure mode.

### I-3: N-3 logging split — P2, Deferred (ADR-025)
~108 files import `global-logger` while the target `lib/logger/*` (6 modules)
exists. This is exactly the MI-5 divergence risk again. Recommendation: batch
migrate by directory (10-15 files per PR, mechanical sed + lint), highest-value
files first (routes/, pipeline/).

### I-4: Test `as any` residue — P3
263 `as any` casts remain in `tests/`. Continue the #863 pattern (typed
fixtures, `as unknown as T` only where justified) at ~30 casts per PR.

### I-5: Workflows cutover flag flip — P2, operator-gated
The shadow workflow (`DiscoveryShadowWorkflow`) has been accumulating
parallel-run data since v0.19.x. Once shadow-vs-direct divergence is reviewed
and ~0 across a full week of 6-hour runs, flip `workflow_pipeline_cutover` to
default-on in staging, then prod, keeping `executePipeline` as explicit
fallback. Record the shadow-diff review as an ADR before flipping.

### I-6: R-6 AI Gateway wiring — P3, product/cost-gated
`worker/lib/ai-gateway/*` is consumed by NLQ-AI and `lib/search/client.ts`, but
response caching and provider failover remain unused. Prod KV/D1 are empty per
the 2026-09-17 audit, so there is no cost case yet — gate on real traffic.

### I-7: Queues adoption for alert/webhook delivery — P2 feature-grade
ADR-031 descoped Queues to inline best-effort fan-out in `publish.ts`. Inline
fan-out means a slow Telegram/webhook endpoint can stall the publish stage
(worst case: cron wall-clock budget). `wrangler.jsonc` has **no queue
bindings** yet. Cloudflare Queues (consumer + max_retries + DLQ) is the
documented fit and also hardens `lib/webhook/delivery.ts`. See F-2.

### I-8: Skills README drift — P3, docs
`.agents/skills/README.md` lists only 10 of 60 skills in its inventory table.
Fixed in this changeset via pointer to `agents-docs/SKILLS-DISTILLED.md`.

Fixed in this changeset via pointer to `agents-docs/SKILLS-DISTILLED.md`.

---

## Part 3 — New Feature Proposals

Ranked by value-to-risk (favoring "wiring over building", the proven
highest-yield pattern from the alerts feature).

### F-1: Deal success-feedback loop ("worked for me") — HIGH VALUE, M effort
The system discovers and ranks deals but never learns whether a deal actually
worked. Infrastructure exists: referral redirect endpoint, D1, trust model,
bots, metrics.

Design sketch:
1. D1 migration: `deal_feedback` (user_id, referral_code, outcome:
   success|expired|invalid, source_channel, created_at) + unique(user, code).
2. API: `POST /api/deals/:code/feedback` (JWT User role) + bot commands
   `/worked <code>`, `/failed <code>`.
3. Feed into the existing trust model: per-code success ratio influences deal
   ranking (`lib/ranking.ts`) and source trust evolution
   (`source-registry` DO / `lib/d1/trust.ts`) — closing the loop the
   trust-model skill describes.
4. EU AI Act Article 12 logging via existing logger (ranking input from
   user-reported data).
5. Metrics: `feedback_ratio`, `median_time_to_feedback` in `/metrics`.

Value: turns the platform from a discovery tool into a quality-ranked one;
directly improves the "deal freshness / no dead codes" success metric.

### F-2: Queues-based alert & webhook delivery with DLQ — HIGH VALUE, S-M effort
Un-descopes ADR-031's known limitation (see I-7). Reuses the DLQ pattern
already proven in `lib/webhook`. Steps: add `queues` binding + consumer
worker entry, move `matchAndNotifySubscriptions` fan-out behind `queue.send()`
with idempotency keys, wire `alert_deliveries` (v14 table, already shipped) as
the delivery ledger.

### F-3: Trending & deal-comparison API — MEDIUM VALUE, S effort
Pure D1 analytics over existing data: `GET /api/deals/trending?window=7d`
(click-weighted, category-grouped) and `GET /api/compare?codes=a,b,c`
(side-by-side reward_value/type/expiry/trust). All inputs already exist
(`referrals` + FTS5 + `system_metrics`). Feeds bot commands and a future web UI.

### F-4: SSE real-time deal feed — MEDIUM VALUE, M effort
`GET /deals/stream` (SSE) emitting publish-stage events. The publish stage
already knows exactly when a deal lands; SSE support exists in the MCP stream
path (`routes/mcp-stream.ts`, `router/mcp-stream-routes.ts`) as a template.
RBAC + rate-limit via the centralized middleware pipeline.

### F-5: Contributor reputation — MEDIUM VALUE, M effort (gated on adoption)
Prod users table is empty (2026-09-17 audit), so gate on adoption: per-user
success-feedback and accepted-submission counts → reputation tier → higher
per-user publish budget (hook into `CANDIDATE_BUDGET_*` config). Depends on
F-1 landing first.

### F-6: A2A (agent-to-agent) protocol support — LOW PRIORITY, owner-gated
Not proposed now: mobile app (4 weeks, no users yet), auto-apply checkout
extension (browser-automation + ToS risk) — defer until adoption justifies.

---

## Part 4 — Skills Distillation Findings (summary)

Full catalog: `agents-docs/SKILLS-DISTILLED.md`. Key findings:

- **60 skills** total; 8 vendored from `cloudflare/skills` (skills-lock.json),
  the rest authored for this repo.
- **Coverage**: 40/60 have `evals/`; 10 have `reference/`; all SKILL.md
  respect the 250-line authoring standard (max 249).
- **Redundancy clusters needing consolidation**: logging (3 parallel skills
  while the repo itself has N-3 open — skills and code disagree); Codacy
  family (5 overlapping skills); orchestration (5 skills with heavy overlap).
- **Missing skills proposed**: `cloudflare-queues`, `cloudflare-workflows`,
  `success-feedback-loop` (after F-1).

---

## Part 5 — Recommended Execution Order

| Wave | Items | Mode |
|:---|:---|:---|
| 1 | I-1 file splits, I-2 dead exports, I-8 docs | Light |
| 2 | F-2 Queues delivery (un-descopes ADR-031) + ADR | Full |
| 3 | F-1 success-feedback loop (4-6 atomic PRs) | Full |
| 4 | F-3 trending/compare, F-4 SSE feed | Light/Full |
| 5 | I-3 N-3 logging migration batches (continuous) | Light |
| Gated | I-5 cutover flip, I-6 gateway, F-5 reputation, F-6 A2A | operator decision |

Owner-blocked (unchanged): prod D1 v13/v14 apply, CI-1 secret (ADR-023),
REDDIT-6 credentials, prod seeding decision, Vectorize dashboard check.

---

*Verification performed 2026-10-02 against `aa8ba5a` via module import tracing,
binding inspection (`wrangler.jsonc`), and line-count audits. Supersedes the
open-items list in `plans/GAP-ANALYSIS-2026-08-15.md` (now fully stale).*

MCP server is complete (15 tools, SSE). A2A adds inter-agent deal exchange
but has no consumer demand signal yet; revisit when agents actually integrate.

Not proposed now: mobile app (4 weeks, no users yet), auto-apply checkout
extension (browser-automation + ToS risk) — defer until adoption justifies.
