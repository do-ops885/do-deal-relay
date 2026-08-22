# Gap Analysis: Missing Implementations, Features, Tests

**Date**: 2026-08-15
**Audit Method**: Static analysis of `worker/` source + `tests/` coverage,
routing/dispatch tracing, and dead-code detection (exports never imported).
**CI Precheck**: `.github/ci-status/ci-status.json` = `passing`.
**Baseline**: `reports/analysis/codebase-audit-2026-04-04.md`,
`reports/analysis/swarm-missing-implementations-2026-04-04.md`,
`reports/analysis/feature-gap-analysis.md`, `plans/GOAP_STATE.md` (v0.14.0).

---

## Executive Summary

| Category | Count | Notes |
|:---|:---:|:---|
| Missing implementations (built but not wired) | 6 | Dead/parallel code paths, unreachable routes |
| Missing features (stubbed / partial) | 3 | Accepted-but-ignored params, simulated defaults, duplicated subsystems |
| Missing tests (zero direct coverage) | ~8 module groups | Batch D1 helpers shipped without tests; whole feature areas untested |

Source/test ratio: **303** worker source files vs **198** test files (107 unit,
7 integration, 3 e2e, 1 smoke, 1 load, 2 browser). Most of the remaining gaps
are "implemented but not integrated" rather than "not built at all".

---

## 1. Missing Implementations (built but not wired)

### MI-1: MCP SSE streaming route is unreachable
**Files**: `worker/routes/mcp-stream.ts`, `worker/lib/mcp/progress.ts`
**Evidence**: `handleStreamingToolCall` and `handleMCPStream` are exported but
never imported by `worker/router/legacy-routes.ts` or
`worker/lib/middleware/pipeline.ts`. No route maps to `/mcp/stream`.
`worker/lib/mcp/progress.ts` (`createProgressTracker`, `getProgress`) is only
consumed by this dead route, so the MCP progress subsystem is also unreachable.
**Impact**: SSE streaming for long-running MCP tool executions (with progress
notification) is effectively absent; the progress tracker is dead code.
**Fix**: Register `GET /mcp/stream` (and wire `handleStreamingToolCall` into the
MCP `tools/call` path) in `legacy-routes.ts`, with auth + rate limiting.

### MI-2: Research-agent scraper framework not integrated
**Files**: `worker/lib/research-agent/scrapers/*` (base, producthunt, github,
hackernews, reddit, generic, ai-extractor, index)
**Evidence**: `createDefaultScraperRegistry`, `readySourceNames`,
`createAIExtractor`, and `resolveResearchSource` are exported from
`scrapers/index.ts` but referenced nowhere outside `scrapers/`. The orchestrator
(`worker/lib/research-agent/orchestrator/index.ts`) still drives discovery via
the older `fetchFromSource` (`fetcher.ts`) + `simulateDiscovery` path.
**Impact**: A complete, tested scraper registry (including the Workers AI
`AIExtractorScraper`) exists but is bypassed. Two parallel research stacks
(`fetcher.ts` + `scrapers/`) drift independently.
**Fix**: Migrate the orchestrator to `createDefaultScraperRegistry()` +
`readySourceNames()`, wire `AIExtractorScraper` into the extraction path, and
retire `simulateDiscovery`/`helpers.ts` simulation once real fetching is the
default.

### MI-3: AI Gateway client is built but never used
**Files**: `worker/lib/ai-gateway/{client,config,types,index}.ts`
**Evidence**: The gateway module is imported only by `tests/unit/ai-gateway.test.ts`.
No NLQ, semantic-search, or route code calls it. `AI_GATEWAY_URL` is configured
in `wrangler.jsonc`, but all LLM calls still go directly to `env.AI`.
**Impact**: The ADR-015 "AI Gateway" item is half-built: configuration and a
tested client exist, but the request path does not route through the gateway
(caching, retries, provider failover unused).
**Fix**: Route NLQ and semantic-search LLM calls through
`worker/lib/ai-gateway` when `AI_GATEWAY_URL` is set, keeping `env.AI` as the
fallback.

### MI-4: DealRegistry Durable Object is deployed but not called
**Files**: `worker/durable-objects/deal-registry.ts`
**Evidence**: `DEAL_REGISTRY` appears only in `worker/types/api.ts` (binding
type) and `worker/index.ts` (export). `stageDeals`, `publishDeals`, and
`getCandidatesBySource` are never invoked by `worker/pipeline/stage.ts`,
`worker/publish.ts`, or `worker/pipeline-executor.ts`. Staging/publish still
uses KV snapshots. The DO has 48 unit tests but no production caller.
**Impact**: The staged-deal registry DO (per ADR-017/PR #588) is provisioned
and tested but does nothing at runtime — staging remains KV-snapshot-based.
**Fix**: Either wire the DO into the `stage`/`publish` phases (single source of
truth for staged deals) or retire the DO and its tests to avoid misleading
coverage.

### MI-5: Legacy expiration manager duplicates the modular refactor
**Files**: `worker/lib/expiration-manager.ts` vs `worker/lib/expiration/*`
**Evidence**: `worker/pipeline-executor.ts` still calls `runExpirationCheck`
from `./lib/expiration-manager` (legacy single file) in the `finalize` phase,
while `worker/scheduled.ts` and `worker/routes/validation/stats.ts` call
`checkDealExpirations` / `runFullValidationSweep` from the modular
`./lib/expiration` package.
**Impact**: Two parallel expiration systems can diverge in policy (which deals
count as expiring, what notification is sent) and double-run work.
**Fix**: Consolidate on `worker/lib/expiration`; re-point the pipeline
`finalize` phase at the modular API and delete `expiration-manager.ts`.

### MI-6: Orphan `worker/db/schema.sql`
**File**: `worker/db/schema.sql` (9.4 KB)
**Evidence**: No worker code or test references it. The runtime schema is
defined by `migrations/*.sql` plus `worker/lib/d1/migrations/schema-part-*.ts`.
**Impact**: Dead schema file that can drift out of sync and mislead maintainers.
**Fix**: Delete it, or replace with a pointer to the canonical migration files.

---

## 2. Missing Features (stubbed / partial)

### MF-1: Hybrid semantic search is accepted but ignored
**File**: `worker/routes/semantic-search.ts`
**Evidence**: `SemanticSearchRequestSchema` accepts `filters` and `hybrid`, but
the handler destructures them as `_filters` and `_hybrid` (unused) and always
returns `match_type: "semantic"`. Keyword+vector hybrid retrieval is not
implemented.
**Impact**: Clients passing `hybrid: true` silently receive pure semantic
results.
**Fix**: Implement hybrid retrieval (keyword FTS5 + vector score fusion) or
reject `hybrid: true` explicitly until supported.

### MF-2: Research agent returns fabricated codes by default
**Files**: `worker/lib/research-agent/helpers.ts`,
`worker/lib/research-agent/orchestrator/index.ts`
**Evidence**: When `useRealFetching` is false (default outside production,
unless the `real_research_fetching` feature flag or `RESEARCH_USE_REAL_FETCHING`
is set), `simulateDiscovery` generates codes like `REFxxxx` with
`https://example.com/referral/...` URLs and random reward text. Real fetchers
(ProductHunt, GitHub, Hacker News, Reddit, company site) exist but are gated
off by default.
**Impact**: The public research endpoint can return fabricated deals unless
explicitly configured otherwise.
**Fix**: Make real fetching the default (with circuit breaker + rate limiting),
drop `simulateDiscovery` for production responses, and gate the simulation
behind an explicit test-only flag.

### MF-3: MCP progress notifications defined but not surfaced
**Files**: `worker/routes/mcp-stream.ts`, `worker/lib/mcp/progress.ts`
**Evidence**: Progress tracking (`_meta.progressToken`) is implemented but only
reachable through the unrouted SSE endpoint (see MI-1). The standard MCP
`tools/call` path does not emit progress.
**Impact**: MCP clients receive no progress for long-running tool calls.
**Fix**: Covered by MI-1; emit progress from `worker/lib/mcp/tools` and expose
the SSE stream.

---

## 3. Missing Tests (zero direct coverage)

Verified by scanning `tests/**` imports against `worker/**` source files.

### T-1: Batch D1 write helpers (shipped in PR #640 with no tests)
**Files**: `worker/lib/d1/audit-log.ts`, `worker/lib/d1/referrals-batch.ts`,
`worker/lib/d1/system-metrics.ts`, `worker/lib/d1/research-cache.ts`,
`worker/lib/d1/factory.ts`
**Evidence**: No test imports `d1/audit-log`, `d1/referrals-batch`,
`d1/system-metrics`, `d1/research-cache`, or `d1/factory`; no test references
`logAuditEvent`, `insertReferralsBatch`, `writeMetric`, or `getResearchCache`.
These are the batching helpers added for the pipeline cache optimization.
**Fix**: Unit tests for each batch helper (empty-array no-op, batching, error
paths).

### T-2: Email HTTP handlers and dispatch
**Files**: `worker/email/handler.ts`, `worker/email/handlers/*` (commands,
forwarded, help, incoming, index, parse, utils), `worker/routes/email.ts`
**Evidence**: Email extraction, patterns, security, and templates have tests;
the handlers and `handleEmailIncoming`/`handleEmailParse`/`handleEmailHelp`
route layer have none.
**Fix**: Unit tests for handler dispatch and the email route handlers.

### T-3: NLQ AI enhancer + hybrid classifier
**Files**: `worker/lib/nlq/ai/*` (entities, expansion, intent, index, types),
`worker/lib/nlq/hybrid/*` (ai-decision, index, rule-classifier)
**Evidence**: Only `tests/unit/nlq/threshold-config.test.ts` touches this area.
The AI query enhancer, intent classifier, and `shouldUseAI` decision logic have
no dedicated tests (the SQL/query-builder and handler layers are covered).
**Fix**: Unit tests for intent classification, query expansion, and hybrid
routing decisions.

### T-4: Validation scraper internals
**Files**: `worker/lib/validation/scrapers/{change-detector,html-extractor,batch-processor}.ts`
**Evidence**: No test imports `validation/scrapers`. `reward-scraper-core`,
code validator, and URL validator are covered via `*-impl` tests; the
change-detector, HTML extractor, and batch processor are not.
**Fix**: Unit tests for change detection, HTML extraction, and batch processing.

### T-5: MCP progress + SSE streaming
**Files**: `worker/lib/mcp/progress.ts`, `worker/routes/mcp-stream.ts`
**Evidence**: No test imports `mcp/progress`; `mcp-stream` is untested dead code.
**Fix**: Unit tests for `createProgressTracker`/`getProgress` KV lifecycle and
SSE encoding.

### T-6: SourceRegistry Durable Object
**File**: `worker/durable-objects/source-registry.ts`
**Evidence**: `tests/unit/storage-snapshots.test.ts` tests `getSourceRegistry`
from `lib/storage` (KV), not the DO's `evolveTrust`/`getTrustScore` methods.
`pipeline-lock` and `deal-registry` DOs have dedicated tests; `source-registry`
does not.
**Fix**: DO tests for trust evolution, getTopTrusted, and batch lookups.

### T-7: D1 trust module (indirect only)
**File**: `worker/lib/d1/trust.ts`
**Evidence**: `evolveTrust`/`getTrustScore`/`getTopTrustedDomains` are exported
via `d1/index.ts` but not directly imported by any test.
**Fix**: Direct unit tests for trust evolution and ranking queries.

### T-8: Modular expiration internals
**Files**: `worker/lib/expiration/{finding,mark-expired,notifications,scheduling,validation}.ts`
**Evidence**: `tests/unit/expiration.test.ts` imports the `lib/expiration`
barrel; individual helpers lack focused coverage (and the legacy
`expiration-manager.ts` path in the pipeline finalize phase is untested).
**Fix**: Focused tests per submodule, and coverage once MI-5 consolidation
lands.

---

## 4. Recommended Action Plan

| Priority | Item | Effort | Unblocks |
|:---|:---|:---|:---|
| P1 | MI-1 route `/mcp/stream` + progress | S | MCP streaming feature |
| P1 | MF-2 default to real fetching | S | Honest research results |
| P1 | T-1 tests for batch D1 helpers | S | Regression safety for PR #640 |
| P2 | MI-5 consolidate expiration (remove legacy) | M | Single expiration policy |
| P2 | MI-2 wire scraper registry + AI extractor | M | Real web research at scale |
| P2 | MF-1 hybrid semantic search | M | Hybrid retrieval |
| P3 | MI-3 wire AI Gateway | M | Caching/failover for LLM calls |
| P3 | MI-4 wire or retire DealRegistry DO | M | DO staging or remove dead DO |
| P3 | MI-6 delete `worker/db/schema.sql` | XS | Repo hygiene |
| P3 | T-2..T-8 test coverage gaps | M | Coverage for untested modules |

---

*Cross-referenced from: `reports/analysis/*`, `plans/GOAP_STATE.md`,
`worker/router/legacy-routes.ts`, `worker/lib/middleware/pipeline.ts`, and
module-level import tracing performed 2026-08-15.*
