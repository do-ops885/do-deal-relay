# GOAP Execution Plan: Missing Tasks Swarm

**Primary Goal**: Track follow-up swarm work arising from the `plans/` audit.
**Created**: 2026-07-01
**Last Updated**: 2026-07-01
**Branch**: `feat/goap-missing-tasks-swarm-v2`

---

## Swarm 1 — Original Three Tasks (CLOSED)

The three tasks originally identified in this plan were re-confirmed against
the current codebase on 2026-07-01 and **were already complete**:

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Add E2E JWT token acquisition for deal endpoint tests | ✅ Done | `tests/e2e/setup-auth.sh` spins up a wrangler dev server on port 8788, registers a test user, signs in, and exports `E2E_JWT_TOKEN` via `tests/e2e/global-setup.ts`. Merged in PR #524. |
| 2 | Add `cheerio` as an explicit dependency | ✅ Done | `package.json` declares `"cheerio": "^1.2.0"` as a runtime dependency. Merged in PR #524. |
| 3 | Expand `calculateAdaptiveBudget` unit tests | ✅ Done | `tests/unit/discovery-budget.test.ts` is 208 lines with 17 cases covering all the boundary/edge cases from the jules audit. Merged in PR #524. |

No further work is required for the original swarm. The plan is preserved
as a historical record.

---

## Swarm 2 — Test Coverage Expansion (In Progress, this PR)

Two source modules were identified as having **zero unit tests** despite
being core, multi-hundred-line components:

| Source | Lines | Coverage | Test File |
|--------|------:|----------|-----------|
| `worker/lib/metrics/stats.ts` | 479 | 0 % | `tests/unit/metrics/stats.test.ts` (new) |
| `worker/lib/d1/client.ts`    | 544 | 0 %  | `tests/unit/d1/client.test.ts` (new) |

### Task A — `tests/unit/metrics/stats.test.ts`

Covers:
- `calculateAggregateStats` — empty defaults, success/failure counts, average
  duration, phase timings, deals counters, errors/retries, gate
  rejections/passes accumulators, validation_cache averaging (including
  missing-cache fallback).
- `formatMetricsForPrometheus` — standard counters, stage_latency_ms gating
  (positive values only), validation_gate_rejections + ratio math, fallback
  to `avg_phase_timings`, COMP-vs-stats override for cumulative values.
- `getCumulativeGateRejections` / `getCumulativeGatePasses` — KV with
  stored JSON, KV with null → empty object.
- `getDetailedPhaseTimingStats` / `getPhaseTimingStats` — phase grouping
  by `phase_results.status`, zero-timings exclusion in percentiles, empty
  list fallback.

### Task B — `tests/unit/d1/client.test.ts`

Covers:
- Constructor config defaults and overrides.
- Session creation via `db.withSession` (when enabled).
- `query`, `queryFirst`, `execute`, `raw` — including SQL `stripSqlComments`
  behavior (full-comment lines stripped, inline trailing comments
  preserved on the SQL line, empty-after-strip short-circuit).
- `batch`, `batchInsert` happy path + `lastRowIds` extraction + empty input
  no-op + syntax-error failure path (no retries).
- `queryWithJson` / `insertWithJson` — JSON parse + stringify round-trip
  and `jsonFields=[]` no-op.
- `transaction` — happy path, compensation on later-op failure, error
  message capture, compensation error swallowed so subsequent
  compensations still run, `_` understood per result-index.
- Retry logic — transient error retries with exponential delay, SQL
  syntax / `no such table` errors short-circuit (no retry), disabled
  retries path.
- Factory functions — `createD1Client`, `createD1ReadClient` (with custom
  bookmark), `createD1WriteClient`.

### Quality gates

- `npm run typecheck` passes with zero errors.
- Vitest: 70 new tests, all passing within ~450 ms.
- No `as any` / `as never` / empty `catch {}` / `TODO`/`FIXME` introduced.

### Validation commands

```bash
npm run typecheck
npx vitest run tests/unit/metrics/stats.test.ts tests/unit/d1/client.test.ts
```

### Commit strategy

- Atomic commits per test file (one commit each) keep the diff reviewable.
- Plan-file update is bundled into a third commit so reviewers see the
  rationale alongside the code.
