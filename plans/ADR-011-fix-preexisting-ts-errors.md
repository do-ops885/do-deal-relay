# ADR-011: Fix Pre-existing TypeScript Errors for CI Green

## Context
PR #380 introduced auth schema changes. After resolving merge conflicts, 44 pre-existing TypeScript errors remain across 11 files, causing Type Check, Format Check, Validation Gates, and Quality Gate CI jobs to fail.

## Root Cause Analysis

### Cluster 1: worker/routes/core/health.ts (16 errors)
- **Wrong file version**: File was overwritten with a broken version lacking proper imports/exports
- **Wrong import paths**: Uses `../` but file is at `core/` level, needs `../../`
- **Missing exports**: Only exports `getHealthStatus`; index.ts expects `handleHealth`, `handleReady`, `handleLive`, `handleMetrics`
- **Strict mode issues**: `kvChecks[key]` returns `T | undefined` under `noUncheckedIndexedAccess`

### Cluster 2: worker/routes/dashboard.ts (5 errors) + worker/index.ts (3 errors)
- **Missing type**: `DashboardStats` not defined in types.ts
- **Missing exports**: Exports `getDashboardStats`/`getDashboardData`; index.ts expects `handleDashboardStats`, `handleDashboardRecentActivity`, `handleDashboardSystemHealth`
- **Wrong handleError**: Calls `handleError(error, request, env, msg)` (4 args) but actual signature takes 2 args and returns ErrorResult, not Response

### Cluster 3: worker/lib/jwt.ts (5 errors)
- **Missing export**: `base64urlEncode` not in crypto.ts
- **Type mismatches**: Uint8Array not assignable to BufferSource/string; match[] undefined

### Cluster 4: worker/lib/mcp/progress.ts (2 errors)
- **Tagged template literal**: `exec\`...\`` passes 2 args but exec() takes 1
- **Unsafe cast**: `as ProgressIndexEntry[]` on unknown[]

### Cluster 5: worker/lib/research-agent/ (3 errors)
- **Wrong data model**: `config.selectors` doesn't exist on ExtractSelectorSet
- **Missing export**: `extractWithSelectorSet` doesn't exist, should be `extractByConfig`
- **Missing config**: `RESEARCH_MAX_REQUESTS_PER_DOMAIN` not in CONFIG

### Cluster 6: Misc (3 errors)
- **bot/discord/commands.ts**: `(option: unknown)` should be `(option)`
- **scripts/validate-url-preservation.ts**: `as unknown` cast strips type info
- **tests/unit/funnel-metrics.test.ts**: Imports missing `handleMetrics` (fixed by Cluster 1)

## Execution Plan

**Strategy**: Parallel (Swarm) - Fix independent file clusters simultaneously

### Phase 1: Fix all TypeScript errors (parallel)
- Agent A: Fix health.ts + index.ts barrel
- Agent B: Fix dashboard.ts + types.ts + index.ts imports
- Agent C: Fix jwt.ts + crypto.ts
- Agent D: Fix mcp/progress.ts + research-agent/* + config.ts
- Agent E: Fix bot/discord/commands.ts + validate-url-preservation.ts

### Phase 2: Run Prettier (sequential after Phase 1)
- `npx prettier --write worker/ tests/ scripts/ bot/`

### Phase 3: Validate (sequential after Phase 2)
- `npm run typecheck`
- `npm run fmt:check`
- `npm run build`
- `npm run validate`

### Phase 4: Commit and push
