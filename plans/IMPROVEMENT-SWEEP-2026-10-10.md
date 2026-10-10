# Improvement Sweep Register — 2026-10-10

**Baseline**: commit `05ef989`, `VERSION` 0.1.8, `tsc --noEmit` clean,
228 unit test files / ~3060 tests green.
**Method**: five parallel read-only domain audits (security, runtime/router,
data/storage, quality/tests, CI/docs) plus independent line-level verification of
every claim in this register. Items already CLOSED/WONTFIX in
[GOAP_STATE](GOAP_STATE.md), [GAP-ANALYSIS-2026-10-04](GAP-ANALYSIS-2026-10-04.md),
or blocked by [ADR-023](ADR-023-ci-external-credentials-and-research-flake.md)
are excluded (notably I-4 redirect re-validation, MI-4 DO hot path, CI-1 token).
**Deliverable**: one small GitHub issue per row below.

---

## Security

| ID | Finding | Priority | Evidence | Issue |
|:---|:---|:---|:---|:---|
| SEC-1 | Refresh tokens are accepted as bearer access tokens (signing-key reuse, no `type` check) | P1 | `worker/routes/auth-helpers.ts:46-50`, `worker/lib/auth.ts:255-259`, `worker/routes/auth-service.ts:128-132` | #885 |
| SEC-2 | MCP tool calls lack role/ownership enforcement (`trigger_discovery` admin bypass; progress cancel/list IDOR) | P1 | `worker/lib/mcp/tools/system.ts:243`, `worker/lib/mcp/handlers/pipeline.ts:42`, `worker/router/legacy-routes.ts:118,330`, `worker/lib/mcp/handlers/progress.ts:71`, `worker/lib/mcp/progress.ts:178` | #887 |
| SEC-3 | Rate limiter fails open for `SENSITIVE_ENDPOINTS` on KV error / missing `DEALS_LOCK` | P2 | `worker/lib/rate-limit-kv.ts:102-113`, `worker/lib/rate-limit.ts:107-109` | #889 |
| SEC-4 | `GET /api/research/:domain` runs outbound research with no rate limit and any authenticated role | P2 | `worker/router/legacy-routes.ts:247-252`, `worker/routes/referral-research.ts:110-113` | #892 |
| SEC-5 | `/api/validate/url` 500 response leaks the raw internal error message | P2 | `worker/routes/validation/url.ts:77-90` | #886 |
| SEC-6 | `verifyApiKey` rewrites KV on every request and drops the key TTL | P3 | `worker/lib/auth.ts:197-199` vs `:97-104` | #888 |
| SEC-7 | Production CORS defaults trust `http://localhost:*` with credentials | P3 | `worker/routes/utils.ts:10-16,22-25,73` | #890 |
| SEC-8 | Docs claim controls that do not exist (port bounds; `API_ENCRYPTION_KEY` KV encryption) | P3 | `SECURITY.md:50` vs `worker/pipeline/security-gate.ts:233-237`; `docs/deployment-runbook.md:66` vs `worker/lib/config-utils.ts:19` | #891 |

## Runtime / router

| ID | Finding | Priority | Evidence | Issue |
|:---|:---|:---|:---|:---|
| RT-1 | `/health/ready` never detects D1 failure (unawaited probe) | P1 | `worker/routes/core/health.ts:24-34` | #893 |
| RT-2 | `?redirect=true` referral detail returns 500 (immutable `Response.redirect` headers) | P1 | `worker/routes/referrals.ts:332`, `worker/lib/rate-limit.ts:231-235`, `worker/router/legacy-routes.ts:222-231` | #894 |
| RT-3 | `PipelineLock.getLockStatus` dereferences the row before the null guard | P2 | `worker/durable-objects/pipeline-lock.ts:196-207` | #895 |
| RT-4 | `/health*` is rate limited despite the documented "no rate limit" contract | P3 | `worker/router.ts:29-51`, `worker/lib/middleware/pipeline.ts:168-176`, `worker/lib/middleware/rate-limit.ts:97-104` | #909 |
| RT-5 | D1 admin API defects: `init` returns 200 on failure, bare `/api/d1` route is dead, `/api/d1/health` skip unreachable | P3 | `worker/routes/d1/admin.ts:22-23,44-52`, `worker/router.ts:57-71`, `worker/routes/d1/index.ts:90`, `worker/router/legacy-routes.ts:351-354` | #896 |
| RT-6 | `DealRegistry.purgeOld` has no production caller (unbounded DO growth) | P3 | `worker/durable-objects/deal-registry.ts:356` | #897 |
| RT-7 | MCP `OPTIONS` preflight returns 401 (handler CORS branch unreachable) | P3 | `worker/router/legacy-routes.ts:318-322`, `worker/routes/mcp/index.ts:56-61`, `worker/lib/auth.ts:281-289` | #898 |
| RT-8 | `real_research_fetching` read via non-seeding `isFeatureEnabled` ignores its declared default | P3 | `worker/lib/feature-flags-defaults.ts:46-52`, `worker/lib/research-agent/orchestrator/index.ts:77`, `worker/lib/feature-flags.ts:118-125` | #899 |


## Data / storage

| ID | Finding | Priority | Evidence | Issue |
|:---|:---|:---|:---|:---|
| DATA-1 | Four tables are queried but no migration creates them (`snapshots`, `referrals`, `system_metrics`, `validation_index`) | P1 | `worker/routes/core/health.ts:292`, `worker/routes/bulk/export.ts:209`, `worker/lib/d1/system-metrics.ts:39`, `worker/lib/validation-cache/index-repository.ts:31` | #900 |
| DATA-2 | `migrations/*.sql` is an unused, drifted duplicate of the runtime schema | P2 | `migrations/0003_auth_schema.sql:56` vs `worker/lib/d1/migrations/schema-part-4.ts:84`; only 0003-0008 exist | #901 |
| DATA-3 | Referral KV indices/status lists use unlocked read-modify-write | P2 | `worker/lib/referral-storage/types.ts:25-54,95-102` | #902 |
| DATA-4 | D1 referral read path unreachable (`USE_D1_READS` never set) and dual-write has no reconciliation | P2 | `worker/lib/referral-storage/dual-write.ts:45,147-150,270-272` | #903 |
| DATA-5 | Retention gaps: `research_cache_kv.expires_at` never written/checked; referral history keys have no TTL | P2 | `worker/lib/d1/research-cache.ts:112-118,141-143`; `worker/lib/referral-storage/types.ts:100-101` | #904 |
| DATA-6 | Referral input KV key collides on missing `id` (`referral:input:unknown`) | P2 | `worker/lib/referral-storage/crud.ts:21` | #905 |
| DATA-7 | EU AI Act log retention cleanup is never scheduled | P2 | `worker/lib/eu-ai-act-logger.ts:411-419` | #906 |
| DATA-8 | Staging KV bindings share a namespace id and use an invalid id | P2 | `wrangler.jsonc:366-378` | #907 |
| DATA-9 | Unbounded reads: expiry queries without `LIMIT`, users list, `searchReferrals` full scan + N+1 | P3 | `worker/lib/referral-storage/d1-queries.ts:145-153`, `worker/lib/d1/status.ts:50-59`, `worker/routes/auth.ts:181-183`, `worker/lib/referral-storage/search.ts:47,72-78` | #908 |

## Quality / tests

| ID | Finding | Priority | Evidence | Issue |
|:---|:---|:---|:---|:---|
| Q-1 | `MAX_LINES_PER_SOURCE_FILE=500` is not enforced (gate fails at 600, `tests/` excluded, pre-commit uses 150 for AGENTS.md vs 200 in AGENTS.md) | P2 | `AGENTS.md:7`, `scripts/quality_gate.sh:225-226,233,237`, `scripts/pre-commit-hook.sh:209-211` | #914 |
| Q-2 | Tautological smoke/placeholder assertions and flaky timing patterns | P2 | `tests/smoke/endpoints.test.ts:16-18` (+4), `tests/unit/auth.headers.test.ts:328-341`, `tests/unit/deal-registry.test.ts:275-281` | #915 |
| Q-3 | High-traffic modules with no test coverage (`ai-gateway/llm.ts`, `middleware/body-limit.ts`) | P2 | 0 test references to `runLLMWithGateway`/`isGatewayEnabled`/`checkBodySize` | #910 |
| Q-4 | Dead exports across `worker/lib` and duplicate `SCHEMA_VERSION` constants | P3 | `worker/config.ts:319,411`, `worker/lib/metrics/names.ts:2-8`, `worker/lib/d1/index.ts:97` vs `worker/config.ts:19` | #911 |
| Q-5 | Duplicated helpers: `hasDangerousChars`, `extractDomain` (x4), `validateUrl` (x3, divergent return types) | P3 | `worker/lib/security.ts:271-285` vs `worker/routes/utils.ts:204-217`; `worker/lib/validation/url-rate-limit.ts:22`, `scrapers/reward-scraper-core.ts:10`, `code-validator.ts:196`, `page-validation.ts:250` | #912 |
| Q-6 | `protobufjs` is a direct runtime dependency with zero importers | P3 | `package.json:43` (also override at `:69`) | #913 |

## CI / scripts / docs

| ID | Finding | Priority | Evidence | Issue |
|:---|:---|:---|:---|:---|
| CI-1 | `scripts/test-unit.js` exits 0 when killed by its timeout — green CI without a completed run | P1 | `scripts/test-unit.js:24-29` | #916 |
| CI-2 | Coverage is never collected (`--coverage` dropped by the runner wrapper); Codecov/artifact uploads are no-ops | P1 | `scripts/test-unit.js:20`, `.github/workflows/ci.yml:118-140`, `codecov.yml:1-9` | #919 |
| CI-3 | `security.yml` hardening: no `permissions:` block, secret-scan gate structurally non-blocking (`.conclusion` + `|| true`), TruffleHog installed from an unpinned main-branch script | P1 | `.github/workflows/security.yml:15-52,90-105` | #921 |
| CI-4 | `ci-and-labels.yml` re-runs the full unit suite already run by `ci.yml` | P2 | `.github/workflows/ci-and-labels.yml:101,139` vs `.github/workflows/ci.yml:88-103` | #917 |
| CI-5 | `pev-gates.sh` secrets/deps gates can never fail (`|| true` inside `run_gate`) | P2 | `scripts/pev-gates.sh:87,90` | #918 |
| CI-6 | Version drift across docs; `update-docs.sh` is not wired into build/release and omits version-bearing files | P2 | `docs/AGENTS.md:4`, `docs/MCP.md:4`, `docs/openapi.yaml:4` vs `VERSION`; `package.json:8` vs `scripts/update-docs.sh:23-30` | #920 |
| CI-7 | `docs/openapi.yaml` omits live, documented endpoints | P2 | 56 paths; no `/api/auth/login`, `/api/experience`, `/api/semantic-search`, `/api/dora-metrics` | #922 |
| CI-8 | `dependencies.yml` duplicates weekly Dependabot npm PRs | P3 | `.github/workflows/dependencies.yml:7,90`, `.github/dependabot.yml:26-29` | #923 |
| CI-9 | `codeql.yml` / `resolve-deepsource.yml` jobs lack `timeout-minutes` (and concurrency) | P3 | `grep -c timeout-minutes` → 0 in both | #924 |
| CI-10 | Docs drift: stale workflow inventory, phantom scripts, inconsistent quality-gate count, README prerequisites | P3 | `.github/REPOSITORY_SETTINGS.md:227-231`, `docs/AGENTS.md:124`, `agents-docs/quality-standards.md:63,66`, `README.md:15,83` | #925 |
| CI-11 | Repo hygiene: stale scratch artifacts and a stale `ci-status.json` parsed with fragile grep patterns | P3 | `scripts/test_exit.sh`, `scripts/test-trufflehog-validate.txt`, `.gh-pr-body.md`, `.github/ci-status/ci-status.json:2-3`, `scripts/quality_gate.sh:21-23` | #926 |

---

## Verification notes

- Every row was re-read in source during this sweep; no finding is based on
  unverified agent output.
- `find worker bot -name '*.ts' | xargs wc -l | awk '$1>500'` is empty today, so
  Q-1 is an enforcement gap, not an existing violation.
- `grep -rn 'CREATE TABLE'` over the repo returns no definition for the four
  tables in DATA-1.
