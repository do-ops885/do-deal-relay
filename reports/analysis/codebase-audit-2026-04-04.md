# Codebase Analysis Report - do-deal-relay

**Date**: 2026-04-04
**Scope**: Full codebase audit
**Version**: 0.1.3

---

## CRITICAL

### C-1: Success Notification Uses Wrong Event Type
**Category**: Bug
**Location**: `worker/state-machine.ts`, line 327-332
**Description**: In the `finalize` phase, the success notification is sent with `type: "system_error"` instead of a success type. This mislabels every successful pipeline run as a system error, polluting monitoring and alerting.
```typescript
await notify(env, {
  type: "system_error",  // BUG: should be something like "pipeline_complete"
  severity: "info",
  run_id: ctx.run_id,
  message: `Pipeline completed successfully...`,
});
```
**Impact**: All successful pipeline completions are logged and potentially alerted as system errors. Downstream monitoring, dashboards, and notification deduplication will be incorrect.
**Suggestion**: Add a `"pipeline_complete"` type to the `NotificationEvent` union in `worker/types.ts` and use it here.

### C-2: D1 Database ID is a Placeholder in Production Config
**Category**: Bug / Configuration
**Location**: `wrangler.toml`, line 70
**Description**: The default D1 database binding uses `database_id = "11111111-1111-1111-1111-111111111111"` which is clearly a placeholder. If the production environment is not explicitly specified with `--env production`, this fake ID will be used.
**Impact**: Any deployment without the explicit `--env production` flag will fail on D1 operations or silently return empty results.
**Suggestion**: Either remove the default D1 binding entirely (make it optional) or use a real staging database ID. Add validation at startup.

### C-3: Notification Deduplication Has No TTL Cleanup
**Category**: Bug
**Location**: `worker/notify.ts`, lines 127-149
**Description**: The notification history stored in KV at `meta:notifications` keeps growing. While it's trimmed to 100 entries, each entry is a full object pushed on every notification. The trimming only happens on write, so if notifications stop flowing, stale entries persist indefinitely. More critically, the cooldown check at line 107-112 filters by `type` AND `source`, but most notifications don't set a `source` in context, defaulting to `"system"`. This means ALL system notifications of the same type share one cooldown window.
**Impact**: Notification deduplication is overly aggressive — different unrelated system_error notifications of the same type will suppress each other for 6 hours.
**Suggestion**: Include `run_id` in the deduplication key, or use a more granular source identifier. Add a TTL-based KV entry per notification type instead of a single array.

### C-4: Lock Race Condition — Non-Atomic Check-Then-Set
**Category**: Bug / Concurrency
**Location**: `worker/lib/lock.ts`, lines 37-76
**Description**: The lock acquisition performs a read-then-write sequence without atomicity. Between checking `env.DEALS_LOCK.get()` and `env.DEALS_LOCK.put()`, another worker could also read the expired lock and both would acquire it. Cloudflare KV does not support compare-and-swap (CAS) operations natively.
**Impact**: Under high concurrency (e.g., multiple edge locations triggering the cron simultaneously), two pipeline runs could execute in parallel, corrupting state.
**Suggestion**: Use KV's `expirationTtl` as the primary mechanism and accept that the read-verify step is best-effort. Alternatively, use D1 with a unique constraint for atomic locking, or Cloudflare Durable Objects for true mutual exclusion.

---

## HIGH

### H-1: Discovery Engine Only Has One Configured Source
**Category**: Missing Feature
**Location**: `worker/config.ts`, lines 113-125
**Description**: The `DEFAULT_SOURCES` array contains only a single source (`trading212.com`). The entire discovery pipeline is built to handle multiple sources with trust scoring, rate limiting, and diversity calculations, but with only one source configured, the system cannot discover any new deals autonomously.
**Impact**: The core value proposition (autonomous deal discovery) is non-functional. The system relies entirely on manual deal submission via `/api/submit`.
**Suggestion**: Add at least 5-10 real referral program sources. Create a seed script (`scripts/seed-kv.sh`) to populate the source registry on first deploy.

### H-2: `handleGetResearchResults` Has No Route Registration
**Category**: Missing Feature / Bug
**Location**: `worker/routes/referrals.ts`, lines 396-422
**Description**: The `handleGetResearchResults` function is defined and exported but is never imported or called in `worker/index.ts`. There is no route that maps to this handler.
**Impact**: The research results endpoint is dead code — unreachable by any client.
**Suggestion**: Either add a route in `worker/index.ts` (e.g., `GET /api/research/:domain/results`) or remove the unused function.

### H-3: D1 Routes Exposed Without Authentication
**Category**: Security
**Location**: `worker/index.ts`, lines 162-164; `worker/routes/d1.ts`
**Description**: All D1 endpoints (`/api/d1/*`) are publicly accessible with no authentication, authorization, or rate limiting. These endpoints provide direct database access including search, stats, domain/category listings, and migration status/initialization.
**Impact**: Anyone can query the database, enumerate all domains/categories, check migration status, and even initialize the database (`/api/d1/migrations?action=init`). This is a significant information disclosure risk.
**Suggestion**: Add API key authentication middleware for D1 routes. At minimum, protect the migration init endpoint. Use the existing `WEBHOOK_API_KEYS` KV namespace or a new API key system.

### H-4: `handleResearch` Endpoint Has No Rate Limiting
**Category**: Security
**Location**: `worker/index.ts`, line 124-126; `worker/routes/referrals.ts`, lines 335-394
**Description**: The research endpoint triggers web fetching across multiple external sources. It has no rate limiting applied, unlike `/api/submit` and `/api/discover` which have explicit endpoint limits in `worker/lib/rate-limit.ts`.
**Impact**: An attacker could trigger unlimited external HTTP requests, incurring costs and potentially hitting rate limits on third-party APIs (Reddit OAuth, etc.).
**Suggestion**: Add `/api/research` to `ENDPOINT_LIMITS` in `rate-limit.ts` (already defined but not applied at the route level) and enforce it in the handler or via middleware.

### H-5: MCP Server Version Mismatch in Documentation vs Code
**Category**: Misleading Implementation
**Location**: `wrangler.toml` line 34 vs `worker/routes/mcp/index.ts` line 234
**Description**: The MCP protocol version is configured as `"2025-11-25"` in wrangler.toml, but the `handleInitialize` function at line 234 always returns the configured version regardless of what the client requests — it doesn't actually negotiate:
```typescript
const protocolVersion =
  params.protocolVersion === MCP_PROTOCOL_VERSION
    ? MCP_PROTOCOL_VERSION
    : MCP_PROTOCOL_VERSION; // Always returns same value
```
**Impact**: The code pretends to negotiate protocol versions but always returns the server's version. If a client requests an incompatible version, it should reject, not silently accept.
**Suggestion**: Implement actual version negotiation — return an error if the client's requested version is incompatible.

### H-6: `evolveSourceTrust` Is a No-Op
**Category**: Misleading Implementation
**Location**: `worker/pipeline/score.ts`, lines 222-235
**Description**: The `evolveSourceTrust` function is exported and named as if it updates source trust scores, but it only logs a message. The comment says "This would update the source registry" but the implementation is missing.
**Impact**: Source trust scores never evolve based on validation results. The trust model is static, making the scoring pipeline's `historical_trust` weight meaningless over time.
**Suggestion**: Implement the actual trust evolution logic using `updateSourceTrust` from `lib/storage.ts`, or rename the function to indicate it's a stub.

### H-7: System Reference Doc Lists Agents as "pending"
**Category**: Documentation Gap / Misleading
**Location**: `agents-docs/SYSTEM_REFERENCE.md`, lines 158-165
**Description**: The system reference lists all agents as `pending` status, but `AGENTS.md` (the root file) lists them as `complete`. This is contradictory and confusing for new agents reading the docs.
**Impact**: Agents may waste time implementing features that already exist, or avoid using components they think are incomplete.
**Suggestion**: Update `SYSTEM_REFERENCE.md` to match `AGENTS.md` status, or remove the agents table from the system reference and link to the registry.

### H-8: Cron Schedule Mismatch Between Config and wrangler.toml
**Category**: Misleading Implementation
**Location**: `wrangler.toml` line 6 vs `worker/config.ts` line 12
**Description**: `wrangler.toml` defines two cron triggers: `"0 */6 * * *"` (every 6 hours) and `"0 9 * * *"` (daily at 9am for expiry). However, `config.ts` only defines `CRON_SCHEDULE: "0 */6 * * *"`. The state machine's `scheduled` handler checks for `"0 0 * * *"` (midnight) and `"0 0 * * 0"` (weekly Sunday midnight) which don't match the wrangler config at all.
**Impact**: The daily expiration check and weekly validation sweep cron handlers will never trigger because the cron patterns don't match. Only the default pipeline execution path runs.
**Suggestion**: Align the cron patterns between `wrangler.toml` and `state-machine.ts`. Either change wrangler to match the state machine checks, or update the state machine to check for the wrangler patterns.

---

## MEDIUM

### M-1: `core.ts` Exceeds 500-Line File Limit
**Category**: Code Quality
**Location**: `worker/routes/core.ts` (603 lines)
**Description**: The project standard (AGENTS.md) mandates max 500 lines per source file. `core.ts` is 603 lines and contains multiple unrelated handlers (health, metrics, deals, discover, submit, analytics, ranked, highlights, similar).
**Impact**: Violates project standards, makes the file harder to maintain and review. Pre-commit hooks should catch this but may not be enforced.
**Suggestion**: Split into focused modules: `health.ts`, `deals.ts`, `submit.ts`, `analytics.ts`, etc.

### M-2: `github.ts` Exceeds 500-Line File Limit
**Category**: Code Quality
**Location**: `worker/lib/github.ts` (688 lines)
**Description**: Similar to core.ts, the GitHub integration module is 688 lines, well over the 500-line limit. It mixes file content operations, commit operations, issue creation, and workflow status polling.
**Impact**: Same as M-1.
**Suggestion**: Split into `github/content.ts`, `github/issues.ts`, `github/workflows.ts`.

### M-3: `dual-write.ts` Exceeds 500-Line File Limit
**Category**: Code Quality
**Location**: `worker/lib/referral-storage/dual-write.ts` (651 lines)
**Description**: The dual-write module is 651 lines and mixes store, read, update, and query operations.
**Impact**: Same as M-1.
**Suggestion**: Split into `dual-write/store.ts`, `dual-write/read.ts`, `dual-write/update.ts`.

### M-4: `mcp/index.ts` Exceeds 500-Line File Limit
**Category**: Code Quality
**Location**: `worker/routes/mcp/index.ts` (669 lines)
**Description**: The MCP route handler is 669 lines.
**Impact**: Same as M-1.
**Suggestion**: Split request handlers into separate files.

### M-5: `state-machine.ts` Exceeds 500-Line File Limit
**Category**: Code Quality
**Location**: `worker/state-machine.ts` (421 lines — close but still within limit)
**Description**: Actually this one is within the 500-line limit. No action needed.

### M-6: `types.ts` Exceeds 500-Line File Limit
**Category**: Code Quality
**Location**: `worker/types.ts` (512 lines)
**Description**: The types file is 512 lines, slightly over the 500-line limit.
**Impact**: Minor violation.
**Suggestion**: Split referral types and research types into separate type files.

### M-7: No Authentication on `/api/submit` Endpoint
**Category**: Security
**Location**: `worker/index.ts`, lines 97-99; `worker/routes/core.ts`, lines 247-372
**Description**: Anyone can submit deals to the system without authentication. While deals are quarantined by default, this allows spam and abuse of the staging area.
**Impact**: KV storage could be filled with spam deals. The staging snapshot could grow unboundedly.
**Suggestion**: Add API key or CAPTCHA verification for deal submission. At minimum, implement the rate limiting already configured for this endpoint.

### M-8: Rate Limiting Not Applied to Most Endpoints
**Category**: Security
**Location**: `worker/lib/rate-limit.ts` — defined but not used in route handlers
**Description**: The rate-limiting module defines endpoint-specific limits for `/api/submit`, `/api/discover`, and `/api/research`, but these are only used by the MCP handler (`/mcp`). Regular API routes don't invoke `checkRateLimit()`.
**Impact**: API endpoints are unprotected against abuse.
**Suggestion**: Create a middleware wrapper or apply rate limiting in each handler. The `createRateLimitMiddleware` factory exists but is not used.

### M-9: `discoverFromSource` Constructs URLs Incorrectly
**Category**: Bug
**Location**: `worker/pipeline/discover.ts`, lines 79-81
**Description**: The discovery engine constructs URLs by concatenating `https://${source.domain}${pattern}` where `pattern` comes from `url_patterns` like `"/invite/*"`. The asterisk is a glob pattern, not a valid URL path. The fetch will attempt `https://trading212.com/invite/*` which will 404.
**Impact**: No deals will ever be discovered from configured sources because the URLs are invalid.
**Suggestion**: Either replace glob patterns with actual URLs, or implement a crawler that resolves glob patterns to real pages.

### M-10: `handleDiscover` Triggers Pipeline Synchronously
**Category**: Performance
**Location**: `worker/routes/core.ts`, lines 195-212
**Description**: The `/api/discover` endpoint calls `executePipeline(env)` synchronously and waits for the entire pipeline to complete before responding. The pipeline involves multiple fetch operations, validation, scoring, staging, and publishing — this could take 30+ seconds.
**Impact**: HTTP request timeouts (Cloudflare Workers have a 30s CPU time limit). The client will likely get a timeout before the pipeline completes.
**Suggestion**: Trigger the pipeline asynchronously and return immediately with a run_id. Provide a status endpoint for polling completion.

### M-11: `validate.ts` Gate 9 (Snapshot Hash Verification) Is Effectively a No-Op
**Category**: Misleading Implementation
**Location**: `worker/pipeline/validate.ts`, lines 318-384
**Description**: The `gateSnapshotHashVerification` function always returns `{ passed: true }` when there's no expected hash configured (line 332-337). Since `ctx.snapshot` is not set until the `stage` phase (which comes AFTER validate), the expected hash is always undefined at validation time.
**Impact**: Gate 9 never actually validates anything. The snapshot hash verification is a security gate that provides no security.
**Suggestion**: Either move this gate to after staging, or implement a meaningful hash check using previously stored deal hashes.

### M-12: `generateSnapshotHash` Has Incorrect Sort Logic
**Category**: Bug
**Location**: `worker/lib/crypto.ts`, lines 32-35
**Description**: `Object.keys(deals).sort()` sorts the keys of the array (i.e., `"0"`, `"1"`, `"2"`, ...) not the deal objects themselves. This means the hash is computed from the JSON serialization of the array with its indices sorted, which is already the default JSON.stringify behavior for arrays. The sort is meaningless.
**Impact**: The hash may not be canonical — two arrays with the same deals in different order will produce different hashes, which might be intentional, but the `Object.keys().sort()` call suggests the intent was to sort the deals themselves.
**Suggestion**: If deal order should not matter, sort the deals array by ID before serializing. If order matters, remove the misleading sort.

### M-13: No Integration Tests for Referral Storage
**Category**: Test Coverage Gap
**Location**: `tests/unit/` — no `referral-storage.test.ts`
**Description**: The referral storage system (KV + D1 dual-write) has no dedicated unit or integration tests. The CRUD operations, search, index management, and dual-write logic are untested.
**Impact**: Changes to referral storage could introduce regressions without detection.
**Suggestion**: Add unit tests for `crud.ts`, `search.ts`, and `types.ts`. Add integration tests for the dual-write path.

### M-14: No Tests for D1 Routes
**Category**: Test Coverage Gap
**Location**: `tests/` — no tests for `worker/routes/d1.ts`
**Description**: The D1 API routes (search, suggestions, stats, deals, domains, categories, migrations, health, similar, recommended, trending) have no test coverage.
**Impact**: D1 route regressions will not be caught.
**Suggestion**: Add integration tests for D1 routes using the `@cloudflare/vitest-pool-workers` test environment.

### M-15: No Tests for Email System
**Category**: Test Coverage Gap
**Location**: `worker/email/` — no corresponding tests
**Description**: The email module (extraction, handler, patterns, security, templates) has no tests at all. This is a complete feature area with zero coverage.
**Impact**: Email processing bugs will not be caught.
**Suggestion**: Add unit tests for email extraction patterns and security validation.

### M-16: `handleSubmit` Creates Deals with Hardcoded `"cash"` Reward Type
**Category**: Bug
**Location**: `worker/routes/core.ts`, line 284-285
**Description**: When generating a deal ID for manual submissions, the reward type is hardcoded to `"cash"` regardless of what the user submits:
```typescript
const dealId = await generateDealId(body.source || "manual", body.code, "cash");
```
**Impact**: If a user submits a percent or credit reward, the deal ID will be computed with `"cash"` as the reward type, causing ID collisions if the same code is later submitted with a different reward type.
**Suggestion**: Extract the reward type from `body.metadata.reward.type` and use it in the ID generation.

### M-17: `wrangler.jsonc` and `wrangler.toml` Coexist
**Category**: Code Quality / Configuration
**Location**: Root directory
**Description**: Both `wrangler.toml` and `wrangler.jsonc` exist in the root. Cloudflare Wrangler will use one or the other depending on the command, which can cause confusion about which config is active.
**Impact**: Developers may edit the wrong config file, leading to deployment mismatches.
**Suggestion**: Consolidate into a single config file. Prefer `wrangler.jsonc` for its comment support, or use `wrangler.toml` for consistency with the existing setup.

### M-18: `rootDir` in tsconfig Includes Everything
**Category**: Code Quality
**Location**: `tsconfig.json`, line 21
**Description**: `"rootDir": "."` with `"include": ["worker/**/*.ts"]` means TypeScript considers the project root as the source root. This can cause issues with output paths and makes it harder to add non-worker TypeScript code later.
**Impact**: Minor — works currently but is fragile.
**Suggestion**: Set `"rootDir": "./worker"` to match the include pattern.

### M-19: Unused Dependencies
**Category**: Code Quality
**Location**: `package.json`, lines 25-28
**Description**: `discord.js` and `telegraf` are listed as runtime dependencies but `telegraf` is only used for Telegram notifications (via direct fetch, not the library), and `discord.js` doesn't appear to be used anywhere in the codebase.
**Impact**: Increased bundle size and potential security vulnerabilities from unused dependencies.
**Suggestion**: Remove `discord.js` if unused. Verify `telegraf` is actually needed (the notify module uses direct fetch to the Telegram API, not the telegraf library).

### M-20: `agent-browser` as a Runtime Dependency
**Category**: Code Quality
**Location**: `package.json`, line 25
**Description**: `agent-browser` is listed as a runtime dependency but appears to be an agent skill, not a library used by the worker. Cloudflare Workers cannot run browser automation libraries.
**Impact**: Deployment may fail or include unnecessary code in the worker bundle.
**Suggestion**: Move to devDependencies or remove if not used by the worker.

---

## LOW

### L-1: `handleLive` Health Check Is Trivial
**Category**: Improvement
**Location**: `worker/routes/core.ts`, lines 84-86
**Description**: The liveness check just returns `{ alive: true }` with a timestamp. It doesn't verify any actual system health.
**Impact**: The liveness probe will report healthy even if KV is down, the database is unreachable, etc.
**Suggestion**: Add at least a basic KV connectivity check.

### L-2: `handleReady` Calls `handleHealth` and Re-parses JSON
**Category**: Performance
**Location**: `worker/routes/core.ts`, lines 77-82
**Description**: `handleReady` calls `handleHealth(env)`, then calls `.json()` on the Response, then reconstructs a new response. This is inefficient.
**Impact**: Minor performance overhead.
**Suggestion**: Extract the health computation into a shared function that both handlers call.

### L-3: Metrics Endpoint Counts `publish` Phase for Successes
**Category**: Improvement
**Location**: `worker/routes/core.ts`, lines 96-98
**Description**: The metrics endpoint counts successful runs by checking `phase === "publish" && status === "complete"`, but the finalize phase is the actual completion point. A pipeline could complete publish but fail at verify.
**Impact**: Metrics may over-report successful runs.
**Suggestion**: Count `phase === "finalize" && status === "complete"` instead.

### L-4: `normalizeText` Strips Non-ASCII Characters
**Category**: Improvement
**Location**: `worker/pipeline/normalize.ts`, line 117
**Description**: The regex `/[^\x20-\x7E]/g` removes all non-ASCII characters from deal titles and descriptions. This would strip legitimate Unicode characters in deal descriptions from non-English sources.
**Impact**: Deal descriptions from international sources will be corrupted.
**Suggestion**: Use a more permissive regex that preserves Unicode letters while removing control characters: `/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g`.

### L-5: `calculateSourceDiversity` and `calculateUniquenessScore` Are Duplicated
**Category**: Code Quality
**Location**: `worker/pipeline/score.ts` lines 127-151 and `worker/pipeline/dedupe.ts` lines 214-237
**Description**: These two functions are defined in both `score.ts` and `dedupe.ts` with identical implementations.
**Impact**: Maintenance burden — changes need to be made in two places.
**Suggestion**: Define them once (e.g., in `lib/ranking.ts` or a shared utils file) and import in both modules.

### L-6: `verifyCommit` in `publish.ts` Is Duplicated
**Category**: Code Quality
**Location**: `worker/publish.ts`, lines 148-160 and `worker/lib/github.ts`, lines 476-483
**Description**: The `verifyCommit` function exists in both `publish.ts` and `github.ts` with slightly different implementations.
**Impact**: Confusion about which version is authoritative.
**Suggestion**: Keep only the `github.ts` version and import it in `publish.ts`.

### L-7: `handleAnalytics` Has No Rate Limiting or Pagination
**Category**: Improvement
**Location**: `worker/routes/core.ts`, lines 579-602
**Description**: The analytics endpoint generates full analytics for up to 30 days of data with no rate limiting or result size limits.
**Impact**: Could be expensive to compute and return large payloads.
**Suggestion**: Add rate limiting and a maximum `days` parameter.

### L-8: `bot/` and `extension/` Directories Are Unexplored
**Category**: Unknown
**Location**: Root `bot/` and `extension/` directories
**Description**: These directories exist in the project but were not detailed in the AGENTS.md project structure. They may contain additional code that should be reviewed.
**Impact**: Unknown — may contain unused or undocumented code.
**Suggestion**: Document or remove these directories if they're not part of the active project.

### L-9: `state.json` in Root Directory
**Category**: Code Quality
**Location**: Root `state.json`
**Description**: AGENTS.md states that state tracking should be in `temp/state.json`, but a `state.json` file exists in the root directory.
**Impact**: Violates the directory organization policy.
**Suggestion**: Move to `temp/state.json` and add to `.gitignore` if not already.

### L-10: Multiple Config Files in Root Violate Policy
**Category**: Code Quality
**Location**: Root directory — `markdownlint.toml`, `opencode.json`, `playwright.config.ts`
**Description**: AGENTS.md specifies a strict root directory policy, but several config files exist in root that aren't on the allowed list.
**Impact**: Inconsistent with project standards.
**Suggestion**: Either update the allowed list in AGENTS.md or move these files to appropriate subdirectories.

### L-11: `CLAUDE.md`, `GEMINI.md`, `QWEN.md` Files in Root
**Category**: Code Quality
**Location**: Root directory
**Description**: These AI agent instruction files are in the root directory, which isn't on the allowed list per AGENTS.md.
**Impact**: Violates directory organization policy.
**Suggestion**: Either add them to the allowed list or move to `.agents/` or `agents-docs/`.

### L-12: `SECURITY.md` and `CONTRIBUTING.md` Not in Allowed Root List
**Category**: Code Quality
**Location**: Root directory
**Description**: Standard GitHub files that aren't listed in the AGENTS.md allowed root files.
**Impact**: Minor policy violation.
**Suggestion**: Update AGENTS.md to include these standard files in the allowed list.

### L-13: `NOTICE` File in Root
**Category**: Code Quality
**Location**: Root `NOTICE`
**Description**: Not on the allowed root files list.
**Impact**: Minor.
**Suggestion**: Add to allowed list or move.

### L-14: `.ignore` File in Root
**Category**: Code Quality
**Location**: Root `.ignore`
**Description**: Not a standard git file and not on the allowed list.
**Impact**: Minor.
**Suggestion**: Remove or document its purpose.

### L-15: `research@example.com` in User Agent
**Category**: Improvement
**Location**: `worker/config.ts`, line 24
**Description**: The User-Agent string contains `research@example.com` which is a placeholder email address.
**Impact**: External sites may block or flag requests from this bot.
**Suggestion**: Use a real contact email or remove the email from the User-Agent string.

### L-16: No OpenTelemetry or Distributed Tracing
**Category**: Improvement
**Location**: Throughout codebase
**Description**: The system generates `trace_id` values but doesn't propagate them to external services or use any tracing infrastructure.
**Impact**: Debugging cross-service issues (GitHub API, Telegram, external fetch) is difficult.
**Suggestion**: Add trace ID propagation via headers to external API calls. Consider Cloudflare's built-in tracing.

### L-17: `handleMCPCall` Legacy Endpoint Has No Rate Limiting
**Category**: Security
**Location**: `worker/routes/mcp/index.ts`, lines 583-629
**Description**: The legacy MCP v1 tool call endpoint doesn't apply rate limiting, unlike the main MCP handler.
**Impact**: The legacy endpoint could be abused without limits.
**Suggestion**: Add rate limiting to the legacy endpoints.

### L-18: `dist/` Directory Should Be Gitignored
**Category**: Code Quality
**Location**: Root `dist/` directory
**Description**: The TypeScript output directory exists in the repo. It should be in `.gitignore`.
**Impact**: Unnecessary files in version control.
**Suggestion**: Verify `.gitignore` includes `dist/` and remove the directory from the repo.

---

## Summary Statistics

| Priority | Count | Categories |
|----------|-------|------------|
| CRITICAL | 4 | Bug (3), Concurrency (1) |
| HIGH | 8 | Missing Feature (2), Security (3), Misleading (2), Config (1) |
| MEDIUM | 20 | Code Quality (7), Security (3), Bug (3), Test Gap (3), Performance (1), Misleading (2), Configuration (1) |
| LOW | 18 | Improvement (4), Code Quality (9), Security (1), Unknown (1), Policy (3) |
| **Total** | **50** | |

## Top 5 Recommendations (by Impact)

1. **Fix the cron schedule mismatch (H-8)** — The daily expiry check and weekly validation sweep never run, meaning expired deals are never cleaned up and validation drift is never checked.

2. **Fix the success notification type (C-1)** — Every successful run is logged as a system error, making monitoring unreliable.

3. **Fix the discovery URL construction (M-9)** — The discovery engine can't actually discover deals because it constructs invalid URLs with glob patterns.

4. **Add authentication to D1 endpoints (H-3)** — Database access is completely open to the public.

5. **Add rate limiting to API endpoints (M-8)** — The rate limiting infrastructure exists but is not applied to any regular API routes.
