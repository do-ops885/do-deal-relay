# ADR: Split `worker/state-machine.ts` to satisfy the 500-line hard cap

**Status:** accepted, not yet implemented
**Branch:** `chore/analysis-fixes`
**Date:** 2026-06-18
**Source analysis:** top of `worker/state-machine.ts` (518 LOC) violates the
`MAX_LINES_PER_SOURCE_FILE=500` invariant declared in `AGENTS.md`.

## Context

`worker/state-machine.ts` is **518 LOC** (28 lines over the hard cap). It hosts
three concerns:

1. **Pipeline orchestration** (`executePipeline`)
2. **Phase dispatch** (`executePhase` switch)
3. **Failure & status helpers** (`handleFailure`, `getPipelineStatus`)

The file imports many siblings and is consumed by only two source files:

| Importer | Surface used |
| --- | --- |
| `worker/scheduled.ts` | `executePipeline` |
| `worker/routes/health.ts` | `getPipelineStatus` |

No tests import `state-machine` directly today (state machine behavior is
exercised through `scheduled.ts` and the integration suite).

## Decision

Refactor to a `worker/state-machine/` directory with a **barrel** index.

### Target layout

| File | LOC target | Role |
| --- | --- | --- |
| `worker/state-machine/types.ts` | ≤ 60 | `StateHandler`, `StateMachine` interfaces shared by executor + status. |
| `worker/state-machine/constants.ts` | ≤ 30 | `PHASES` array (single source of truth for the 10-phase order). |
| `worker/state-machine/error-handler.ts` | ≤ 90 | `handleFailure` helper. Uses `import("../lib/storage")` for `revertProduction`. |
| `worker/state-machine/executor.ts` | ≤ 320 | `executePipeline` + `executePhase`. Heavy because of the 10-case switch and the per-phase logging. |
| `worker/state-machine/status.ts` | ≤ 60 | `getPipelineStatus` with parallelized lock + last-run retrieval. |
| `worker/state-machine/index.ts` | ≤ 20 | Barrel: `export { executePipeline } from "./executor"; export { getPipelineStatus } from "./status";`. |

### Behavior preservation

- Dynamic `import()` paths inside the file **must** move up one level:
  - `import("./lib/storage")` → `import("../lib/storage")` (in `error-handler.ts`)
  - `import("./lib/lock")` → `import("../lib/lock")` (in `status.ts`)
- The `Env` and `PipelineContext` types are unchanged; `executor.ts` continues
  to thread `run_id` / `trace_id` identically.
- `logger.debug(...)` + `notify(...)` call sites in `executor.ts` keep the same
  call signatures.

### Import-graph strategy (preference: barrel re-export)

The smallest-diff path is a **barrel re-export** to avoid touching
`worker/scheduled.ts` and `worker/routes/health.ts`:

1. **Commit A — create directory + barrel transition:** Add the five new files
   in `worker/state-machine/`. Replace the entire body of
   `worker/state-machine.ts` with `export * from "./state-machine/index";`
   (this is a 1-line file, satisfies the cap trivially). Update any relative
   `import()` paths **inside** the new files.
2. **Commit B — direct imports:** Update `worker/scheduled.ts` and
   `worker/routes/health.ts` to import directly from
   `./state-machine/executor` / `../state-machine/status`. This drops the
   re-export shim.
3. **Commit C — delete shim:** Delete `worker/state-machine.ts` once all
   importers point at the new paths.

### Test plan per commit

- **Commit A:** `npm run test:unit tests/unit/scheduled.test.ts
  tests/unit/health-endpoint.test.ts tests/integration/scheduled.test.ts`
  must remain green. `npm run typecheck` must pass.
- **Commit B:** same suite, plus `npm run validate` (full local gate).
- **Commit C:** same suite. Add a quick `vitest` mock assertion that
  `import { executePipeline } from "./state-machine"` no longer resolves from
  the old path (compile-time gate; not a runtime assertion).

### Risks

- **Dynamic `import()` path typos** are the dominant failure mode. Any miss
  produces a runtime crash inside the worker (KV `DEALS_LOG` handlers will not
  roll back). Mitigation: grep `import(['"]\.\\./lib` in the moved files.
- **Circular dependency** between `executor.ts` and `error-handler.ts` is
  possible only if `error-handler.ts` ever needs `executePhase`. Currently it
  does NOT — it only imports `notify` and `lib/storage`. Keep that invariant.
- **`moduleResolution` behavior:** explicit `./executor` import path keeps TS
  happy. Avoid the bare `./state-machine` directory import unless `tsconfig`
  is verified to resolve directories under the current `moduleResolution`
  ("bundler" in `tsconfig.json` supports this, but be explicit for clarity).

## Rollback

Each commit is independently revertable. The barrel re-export in Commit A
performs the move **without** changing any consumer, so reverting Commit B/C
keeps imports valid through the shim.

## Linked

- AGENTS.md: `MAX_LINES_PER_SOURCE_FILE=500`
- agents-docs/quality-standards.md: file-size section
- plans/GOAP_STATE.md: ADR template style
