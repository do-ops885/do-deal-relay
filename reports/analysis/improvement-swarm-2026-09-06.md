# Improvement & Feature Analysis — GOAP Swarm 2026-09-06

**Generated**: 2026-09-06
**Method**: GOAP orchestrator + 7 parallel analysis agents (structure, backlog-verification, code-hotspots, pipeline, search-infra, rate-limit, web-research)
**Repo state**: main @ 872d411 lineage, GOAP_STATE v0.19.10, 2872/2872 unit tests green, zero open PRs
**Research sources**: Cloudflare official docs (Rules of Durable Objects, Rules of Workflows, Workers Best Practices, Rate Limiting API, Queues, Vectorize) — all verified 2026-09-06

---

## Executive Summary

The repo is in an unusually healthy state (queue empty, all test-gap items T-2/T-3/T-4 closed). The remaining leverage is concentrated in four areas:

1. **RL-1 rate-limit race** — the open P1. Official guidance has shifted since ADR-017 was written: the DO-per-key design proposed there is now an explicitly documented **anti-pattern**; Cloudflare ships a native Rate Limiting binding that solves this without any DO migration.
2. **Pipeline durability** — the cron-driven `executePipeline` has no checkpoint/resume; Cloudflare Workflows (built for exactly this discovery → validation → publish shape) is the documented best practice for multi-step background work.
3. **Dormant built-and-tested infrastructure** — MI-2/MI-4/MF-2: research-agent real fetchers, DealRegistry DO, and AI Gateway pieces exist and are tested but not wired into runtime paths.
4. **New feature: personalized deal alerts** (saved NLQ queries × semantic match × existing notification channels) — highest-value net-new capability; ~90 % of the required infrastructure already exists.

---

## Part 1 — Verified Backlog State (Agent B/D findings)

Claims in `plans/GOAP_STATE.md` were re-verified against code per the AGENTS.md Re-Verification Protocol:

| Item | GOAP claim | Code verification | Verdict |
|:---|:---|:---|:---|
| RL-1 | KV check-then-set race, DO migration required | CONFIRMED — `worker/lib/rate-limit.ts:200-221` does `get` → compare → `put` (non-atomic). None of the 3 DO classes extend `DurableObject` (source-registry.ts:73, pipeline-lock.ts:56, deal-registry.ts:70), so ADR-017's RPC path still fails at runtime | OPEN, but see §2.1 — better fix exists |
| MI-1 | MCP SSE stream never routed | STALE — `worker/router/mcp-stream-routes.ts` routes `/mcp/stream` + `/mcp/stream/tools/call` with rate limiting; `mcp/progress` imported by `routes/mcp/tools.ts` | CLOSE MI-1 + MF-3 in GOAP_STATE |
| MI-3 | AI Gateway built but unused | STALE — consumed by `worker/lib/nlq/ai/*` and `worker/lib/search/client.ts` | CLOSE MI-3 |
| MI-5 | Legacy `expiration-manager.ts` duplicate | STALE — file no longer exists; only modular `lib/expiration/` remains | CLOSE MI-5 |
| MI-6 | Orphan `worker/db/schema.sql` | STALE — `worker/db/` no longer exists | CLOSE MI-6 |
| MF-2 | Research agent returns simulated codes | CONFIRMED — `orchestrator/index.ts:338` calls `simulateDiscovery` while real fetchers (`api-fetchers.ts`, `page-fetcher.ts`, `reddit-fetcher.ts`, all SSRF-hardened via `validatedFetch`) exist and are tested but not on the orchestrator path | OPEN — highest-value wiring gap |
| MI-2 | Scraper registry + AIExtractorScraper not wired | CONFIRMED — `scrapers/` directory exists, orchestrator does not use it | OPEN |
| MI-4 | DealRegistry DO not called by stage/publish | CONFIRMED for runtime path (mirrors detached from hot path by #750 by design) | OPEN, low priority |
| VERSION drift | "Single Source of Truth: root VERSION" | `VERSION` = 0.1.8, `package.json` = 0.1.8 (consistent), but GOAP_STATE reports v0.19.10 — the GOAP version counter and system version have diverged semantically | Document distinction in GOAP_STATE header |

Housekeeping: five stale ⬜ OPEN rows (MI-1, MI-3, MI-5, MI-6, MF-3) should be flipped to ✅ CLOSED with evidence pointers — cheap Light-Mode PR.

---

## Part 2 — Improvements (prioritized, research-backed)

### 2.1 RL-1: Replace KV rate limiting with the native Workers Rate Limiting binding — P1

ADR-017 (2026-07-07) proposed migrating rate limiting to Durable Objects. Official guidance published since then reverses this:

- Cloudflare's *Rules of Durable Objects* explicitly lists **"Do not use a single Durable Object as a global singleton"** with a global rate limiter as the canonical bad example — it becomes a serialization chokepoint (~500-1,000 req/s ceiling per object). Source: developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Cloudflare ships a first-class **Rate Limiting binding** (`ratelimits` in wrangler config, `env.LIMITER.limit({ key })`): counters cached on the same machine as the Worker, no network wait, eventually-consistent-but-fast — the documented pattern for per-key, per-route limits. Source: developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Docs recommend keying on stable identifiers (API key, user ID, route) over IPs — matching the existing `keyPrefix:identifier:window` scheme in `worker/lib/rate-limit.ts`.

**Proposal**: add `ratelimits` bindings to `wrangler.jsonc` (one namespace per limit class), refactor `checkRateLimit` to call `env.LIMITER.limit()` with the existing key, keep the KV path as fallback for local/test deployments that omit the binding (the code already handles absent bindings gracefully at rate-limit.ts:190). Retain fail-closed behavior for `SENSITIVE_ENDPOINTS`. This closes RL-1 without the risky `extends DurableObject` migration, and ADR-017's rate-limit scope should be superseded by a new ADR. Constraint: binding periods are 10 s or 60 s only — audit current `windowSeconds` configs for compatibility; keep KV for any non-conforming window.

Effort: S–M. Risk: low (fallback retained).

### 2.2 Pipeline durability: adopt Cloudflare Workflows for the discovery pipeline — P1/P2

Current shape: `scheduled()` → `executePipeline(env)` runs discovery → validation (9 gates) → publish inside a single cron invocation, guarded by PipelineLock DO + D1 CAS.

- Cron triggers have **no retries and a 15-minute wall-time cap**; a failure mid-pipeline loses the whole run until the next 6-hour tick. Sources: developers.cloudflare.com/workers/platform/limits/
- *Workers Best Practices* says: **"Use Workflows when the background work has multiple steps that depend on each other… if a step fails, only that step is retried — not the entire job."** Source: developers.cloudflare.com/workers/best-practices/workers-best-practices/
- *Rules of Workflows*: granular idempotent steps, ≤1 MiB per step return, deterministic step names — the existing pipeline stages (per-source discovery, per-gate validation batches, publish) map 1:1 onto `step.do()` units. Source: developers.cloudflare.com/workflows/build/rules-of-workflows/

**Proposal**: keep the cron as trigger, but have `scheduled()` do only `env.DISCOVERY_WORKFLOW.create()`. Steps: `discover:{source}` (one step per source — a Reddit 503 no longer kills HN results), `validate:batch-{n}`, `publish`, `notify`. Default 5-retry exponential backoff replaces hand-rolled retry code; PipelineLock stays as a cheap idempotency guard during transition. Note ADR-018-durable-execution-migration.md already exists — this supplies the current official-doc backing to activate it.

Effort: M–L (Full Mode: spec + ADR update). Risk: medium — mitigate by running Workflow in shadow mode behind a feature flag (`worker/lib/feature-flags.ts` already exists) before cutover.

### 2.3 MF-2: Wire real discovery fetchers into the orchestrator — P2, high product value

The single biggest gap between what the README promises ("Autonomous AI-agent deal discovery") and what runs: `orchestrator/index.ts:338` generates simulated codes while production-grade, SSRF-hardened fetchers sit unused in the same directory.

**Proposal**: feature-flagged rollout (`RESEARCH_REAL_FETCH`), source-by-source: HN (public API, friendliest ToS) → RSS → Reddit (per SPEC-reddit-post-lifecycle / REDDIT-5 finishing). Route each source through the existing scraper registry (closes MI-2 simultaneously), respect the existing `rate-limiter.ts` and `CANDIDATE_BUDGET_*` vars, and keep `simulateDiscovery` as the flag-off/test path. Every discovered code still passes the 9 validation gates, so blast radius is bounded by design.

Effort: M per source. Risk: low-medium (external ToS/quotas — document per source in the spec).

### 2.4 Code hygiene sweep — P3, Light Mode

- **500-line ceiling pressure**: `lock.ts` (498), `legacy-routes.ts` (496), `d1/client.ts` (496), `routes/referrals.ts` (494), `reddit.ts` (492), `circuit-breaker.ts` (492) are within 2-8 lines of the hard MAX_LINES_PER_SOURCE_FILE=500 limit. Any touch forces an unplanned split mid-PR. Pre-emptively split the top 4 (referrals.ts is a designated Hot File — coordinate).
- **Two parallel rate-limit modules**: `rate-limit.ts` + `rate-limit-kv.ts` (455 lines) — consolidate during 2.1.
- **tsconfig**: `exactOptionalPropertyTypes: false` is the last non-strict flag (F-11 deferred). Re-scope after the 2.1/2.3 churn settles.
- **Dependency posture**: 12 security `overrides` pins in package.json — schedule a quarterly review to drop pins whose upstreams have released fixed versions, before the pins themselves block upgrades.

---

## Part 3 — New Feature Proposal: Personalized Deal Alerts (Saved-Search Subscriptions)

**What**: users save an NLQ query ("cloud credits over $100", "SaaS deals for developer tools") and get notified via their channel of choice (Telegram / Discord / email / webhook) when a newly published deal matches — using hybrid keyword + semantic matching.

**Why this feature**:
- The feature-gap analysis lists input channels as COMPLETE and search as the weak axis; this converts existing passive search into an active retention loop — the standard growth mechanic for deal aggregators.
- It is almost entirely **wiring, not building** — the highest value-to-risk ratio of any net-new feature:

| Component | Status |
|:---|:---|
| Saved queries | ✅ `worker/lib/d1/nlq-saved.ts` exists |
| Query understanding | ✅ NLQ hybrid classifier + AI enhancer (tested in v0.19.10) |
| Semantic matching | ✅ Vectorize index + Workers AI embeddings (`lib/search/`), weekly embedding regeneration already in `scheduled.ts` |
| Notification channels | ✅ Telegram/Discord bots, email, HMAC-signed webhooks with retry + DLQ |
| Trigger point | ✅ Publish stage of pipeline (or `publish` Workflow step per 2.2) |
| Missing | Match-fan-out engine + subscription preferences table + digest batching |

**Design sketch** (Full Mode, spec required):
1. D1 migration: `alert_subscriptions` (user_id, saved_query_id, channel, threshold, frequency: instant|daily-digest, active) — follows existing RBAC (User role, mirroring `/api/nlq` policy).
2. On publish: embed new deals (pipeline already does this), run each active subscription's query via the existing hybrid search against **only the new-deal batch** (bounded cost), score ≥ threshold → enqueue notification.
3. Fan-out via **Cloudflare Queues** with a dead-letter queue — official best practice for decoupled, idempotent delivery with bounded retries (max_retries + DLQ, idempotent consumers). Source: developers.cloudflare.com/queues/configuration/configure-queues/. This also introduces the Queues primitive the architecture currently lacks for the webhook delivery retry path in `lib/webhook/delivery.ts`.
4. Daily-digest mode rides the existing `0 9 * * *` cron.
5. EU AI Act logging: alert decisions are AI-assisted ranking → log via existing `eu-ai-act-logger.ts` (Article 12 continuity).

Effort: M (est. 4-6 atomic PRs: migration, subscription CRUD API, matcher, queue consumer, bot commands, docs). Every PR independently green per PEV.

---

## Part 4 — Recommended GOAP Execution Order

| Wave | Items | Mode | Rationale |
|:---|:---|:---|:---|
| 1 | GOAP_STATE housekeeping (close MI-1/MI-3/MI-5/MI-6/MF-3 as stale); split 4 near-500-line files | Light | Zero-risk, unblocks accurate planning |
| 2 | RL-1 via Rate Limiting binding (+ ADR superseding ADR-017 rate-limit scope) | Full | Last open P1; small, well-documented fix |
| 3 | MF-2 real fetchers behind flag (HN first) + finish REDDIT-5 | Full | Core product promise; bounded by validation gates |
| 4 | Workflows migration for pipeline (shadow mode → cutover) | Full | Durability; enables per-source retry |
| 5 | Personalized Deal Alerts feature | Full | New feature; benefits from waves 3-4 landing first |

Parallelizable within waves: file splits (wave 1) have non-overlapping scopes and suit a swarm; waves 2-5 are sequential at the wave level but internally decomposable.

Blocked/external (unchanged): CI-1 (CLOUDFLARE_API_TOKEN — owner action, ADR-023).

---

## Sources

- Rules of Durable Objects — https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workers Rate Limiting binding — https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Workers Best Practices — https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Rules of Workflows — https://developers.cloudflare.com/workflows/build/rules-of-workflows/
- Workers platform limits (cron 15-min wall time, no retries) — https://developers.cloudflare.com/workers/platform/limits/
- Durable Objects limits — https://developers.cloudflare.com/durable-objects/platform/limits/
- Queues configuration (DLQ, max_retries) — https://developers.cloudflare.com/queues/configuration/configure-queues/
