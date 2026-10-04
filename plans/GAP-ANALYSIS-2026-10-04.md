# Gap Analysis: Missing Implementations, Features, Improvements

**Date**: 2026-10-04
**Audit Method**: Static analysis of `worker/` source + `tests/` coverage,
route/flag/import tracing, dead-export detection, and doc drift checks.
Baseline re-verified: `tsc --noEmit` clean, 224 unit test files / 3030 tests
green, zero open issues, zero open PRs.
**CI Precheck**: `.github/ci-status/ci-status.json` = `passing`
(last_run 2026-09-07; stale but green).
**Baseline**: [GAP-ANALYSIS-2026-08-15](GAP-ANALYSIS-2026-08-15.md),
[GOAP_STATE](GOAP_STATE.md) v0.19.32, ADR-015 roadmap.

---

## Executive Summary

| Category | Count | Notes |
|:---|:---:|:---|
| 2026-08-15 items re-audited | 17 (MI-1..6, MF-1..3, T-1..8) | All verified closed or WONTFIX |
| New missing implementations | 2 | Flag enforcement gap; dead rollout flag |
| Carried register items | 4 | N-3 logging, FTS5 parity, F-4 DO cutover, ops-blocked set |
| Improvement candidates | 5 | Dashboard epic, OTEL, build-once, alert parity, eval coverage |

Source/test ratio improved: **344** worker source files vs **238** test files
(was 303/198 on 2026-08-15). Remaining gaps are configuration-governance
(flags) and deferred-migration items, not unwired subsystems.

---

## 1. Re-verification of 2026-08-15 Items (all closed)

| Item | 2026-10-04 Evidence |
|:---|:---|
| MI-1 MCP SSE unrouted | CLOSED — `worker/router/mcp-stream-routes.ts` registered via `legacy-routes.ts:339`; `/mcp/stream` + `/mcp/stream/tools/call` live |
| MI-2 scraper registry bypassed | CLOSED — orchestrator uses `createDefaultScraperRegistry()` + `readySourceNames()` (`orchestrator/index.ts:102-104`); `extractWithAI` wired at `:335` |
| MI-3 AI Gateway unused | CLOSED — `runLLMWithGateway` used by `nlq/ai/{entities,expansion,intent}.ts`; `isGatewayEnabled` gates embedding-pipeline; `env.AI` fallback retained |
| MI-4 DealRegistry DO | WONTFIX (by design per #750 & ADR-022) |
| MI-5 legacy expiration-manager | CLOSED — `worker/lib/expiration-manager.ts` deleted; zero references |
| MI-6 orphan `worker/db/schema.sql` | CLOSED — `worker/db/` absent |
| MF-1 hybrid search ignored | CLOSED — FTS5+vector RRF fusion via `lib/search/hybrid` (`semantic-search.ts:169`); `min_reward` filter enforced hybrid-only |
| MF-2 fabricated codes default | CLOSED — real fetching default-on (flag 100%); simulation reachable only via explicit test-only path (`orchestrator/index.ts:352`) |
| MF-3 MCP progress unsurfaced | CLOSED — `tools/call` progress bundle in `routes/mcp/tools.ts:70`; `check_progress` tool in `lib/mcp/tools/system.ts:248` |
| T-1..T-8 test gaps | CLOSED — T-2/T-3/T-4 verified closed v0.19.30; `batch-processor.test.ts`, `change-detector.test.ts`, `tests/unit/d1/*`, `tests/unit/alerts/*` present; 3030 tests green |

---

## 2. New Missing Implementations

### NI-1: Feature flags defined but never enforced at the route layer

**Files**: `worker/lib/feature-flags.ts` (DEFAULT_FLAGS),
`worker/router/ops-routes.ts`, `worker/router/legacy-routes.ts`
**Evidence**: `isFeatureEnabled` has exactly three production readers
(`workflows/pipeline-trigger.ts`, `workflows/shadow-trigger.ts`,
`research-agent/orchestrator/index.ts`). Five of the nine default flags have
zero readers:

| Flag | Default | Routes live regardless |
|:---|:---|:---|
| `bulk_import_export` | `enabled: false` | `POST /api/bulk/import`, `GET /api/bulk/export` (`ops-routes.ts:31,43`) |
| `email_processing` | `enabled: false` | `POST /api/email/incoming`, `POST /api/email/parse`, `GET /api/email/help` (`legacy-routes.ts:392,398,410`) |
| `analytics_dashboard` | `enabled: true` | `/api/analytics*`, `/api/dashboard/*` |
| `webhook_system` | `enabled: true` | `/webhooks/*` |
| `nlq_ai_enhancement` | `enabled: true` | `/api/nlq*` AI paths |

**Impact**: Two endpoint families are publicly reachable while their kill
switches report "disabled" — the flag dashboard gives operators a false
sense of control, and bulk import (50 KiB body, user-auth) cannot actually
be turned off without a deploy.
**Fix**: Check the flag in `ops-routes.ts` / email dispatch (return 404/503
when disabled), or delete the flag rows and document the endpoints as
always-on. Decision needed per flag; cheapest correct move is enforcement
for the two `enabled: false` flags.

### NI-2: `ai_extractor_scraper` flag is dead config

**Files**: `worker/lib/feature-flags.ts:58`,
`worker/lib/research-agent/compliance-log.ts:155`
**Evidence**: The flag is declared (`enabled: false`, `rolloutPercentage: 0`,
description promises "gradual rollout via setFeatureFlag") but never read.
`extractWithAI` gates only on `env.AI` presence, so LLM extraction runs
unconditionally on every fetched page when Workers AI is bound.
**Impact**: An advertised-off feature is actually always-on: unbudgeted
Workers AI spend per research run, and an EU AI Act Article 12 surface that
operators cannot disable via the documented control.
**Fix**: Read the flag in `extractWithAI` (fail-closed: skip when disabled)
or remove the flag row and update the description to "always on when AI
binding present".

---

## 3. Carried Register Items (unchanged since v0.19.32)

| ID | Item | State | Blocker |
|:---|:---|:---|:---|
| N-3 | Logging consolidation — 110 `global-logger` importers vs 0 `lib/logger` barrel importers (re-measured 2026-10-04; was ~107 on 2026-10-02) | DEFERRED per ADR-025 | Importer migration volume |
| ALERT-PARITY | Alerts matcher is keyword/token (D1 LIKE), not SPEC-deal-alerts-764 FTS5 path | OPEN, functionally adequate on free tier | Optional hardening |
| F-4 | ADR-017 Phase 2 DO cutover (`extends DurableObject`) | DEFERRED | Gates RL-1 (ADR-028) |
| OPS-1 | Prod D1 v13/v14 apply (`alert_subscriptions`, `alert_deliveries`+`ai_act_logs`) | OWNER-BLOCKED | Approved runbook per `.agents/skills/d1-ops` |
| OPS-2 | `wrangler queues create alert-queue` + `alert-queue-dlq` in every env | OWNER-BLOCKED | Queue fan-out (v0.19.32) inert until created |
| OPS-3 | Prod seeding: pipeline bootstrap + embedding backfill (KV/D1/Vectorize empty in prod since 2026-06-05) | OWNER decision | Launch call |
| OPS-4 | REDDIT-6 credentials; CI-1 secret (ADR-023); Vectorize free-plan dashboard check | OWNER-BLOCKED | External secrets/access |


---

## 4. Improvement & New-Feature Candidates

### IMP-1: Web UI Dashboard epic (#298-#302) — only remaining feature epic
`public/` already ships a vanilla-JS SPA (api.js, analytics.js, deals.js,
referrals.js, router.js, components/) whose endpoints all resolve. The
epic's React+Tailwind rebuild remains a separate-project decision
(FOLLOWUP-p3-features). Incremental alternative: extend the existing SPA
with referral tracking (#301) and analytics views (#300) against live
`/api/dashboard/*` endpoints instead of a new stack.

### IMP-2: OpenTelemetry / distributed tracing (P3-17)
`docs/opentelemetry-setup.md` and Cloudflare observability exist; no SDK
integration. Workers OTEL is now GA on the platform — low-effort win for
the 9-gate pipeline and queue consumer spans.

### IMP-3: Build-once-promote-everywhere (ADR-015 H-3)
`scripts/generate-version.sh` runs on every `dev`/`build`, so staging and
prod artifacts can drift. Store the built artifact (R2/Workers Builds
artifact) and promote the same bundle across environments.

### IMP-4: Alerts FTS5 matcher parity (hardening)
Swap the keyword/token matcher for the SPEC's D1 FTS5 path
(`referrals_fts` already exists for search) to improve recall on multi-word
saved searches; keep token matcher as fallback for tiny datasets.

### IMP-5: Eval coverage beyond skills
`scripts/check-evals-freshness.sh` guards `.agents/skills/**/evals.json`
only. No eval harness covers NLQ intent classification, hybrid-search RRF
fusion quality, or the alerts matcher — the three AI-facing surfaces most
prone to silent quality regressions.

---

## 5. Recommended Action Plan

| Priority | Item | Effort | Unblocks |
|:---|:---|:---|:---|
| P1 | NI-2 wire or delete `ai_extractor_scraper` flag (fail-closed) | XS | Cost + compliance control |
| P1 | NI-1 enforce `bulk_import_export` + `email_processing` flags (or delete) | S | Honest kill switches |
| P2 | IMP-5 eval harness for NLQ/search/alerts | M | AI quality regression safety |
| P2 | IMP-2 OTEL tracing | M | Pipeline observability |
| P3 | N-3 importer migration wave (110 files) | L | ADR-025 completion |
| P3 | IMP-4 alerts FTS5 parity | M | Alert recall |
| P3 | IMP-3 build-once promote | M | Deploy drift removal |
| OWNER | OPS-1..OPS-4 | — | Prod launch readiness |

---

*Cross-referenced from: `worker/lib/feature-flags.ts`,
`worker/router/{ops-routes,legacy-routes}.ts`,
`worker/lib/research-agent/compliance-log.ts`, `plans/GOAP_STATE.md`,
`plans/ADR-015`, `plans/ADR-025`, and import tracing performed 2026-10-04.*

