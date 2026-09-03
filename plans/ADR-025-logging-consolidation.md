# ADR-025: Logging Consolidation (N-3 Triage and Fix)

**Status**: Accepted
**Date**: 2026-09-03
**Deciders**: opencode
**Context**: GOAP finding N-3 (parallel logging subsystems)

## Context

N-3 flagged `worker/lib/global-logger.ts` (~90 importers) vs `worker/lib/logger/*`
(4 modules at triage time, 6 today) as parallel logging subsystems with divergence
risk. Investigation on 2026-09-03 showed the finding is half true:

1. `worker/lib/logger/*` (`legacy.ts`, `query.ts`, `export.ts`, `structured.ts`,
   `types.ts`) is **durable KV run-log storage** (`DEALS_LOG`), not a second
   console logger. It already reports its own failures through `global-logger`.
   Layering is correct; merging it into the console logger would harm separation.
2. True duplication exists in two places:
   - `bot/lib/logger.ts` (128 lines) duplicates the worker `createLogger`
     factory line-for-line (same levels, same entry shape, same console switch).
   - `worker/lib/logger/structured.ts` carries its own `console.*` level switch
     plus `console.error` fallbacks — a second console-routing code path.

## Decision

- Keep the durable run-log layer as-is (no merge into the console logger).
- Single-source console routing: export `emitConsole(level, output)` from
  `worker/lib/global-logger.ts`; use it in `global-logger` itself and in
  `StructuredLogger` (mirror and fallbacks). Level-to-method mapping unchanged.
- `bot/lib/logger.ts` becomes thin re-exports of the worker factory and types.
  Precedent: `bot/api-client.ts` already imports from `../worker/types`, and
  `global-logger.ts` has zero imports so nothing bleeds across tiers.
- Deliberately **not** re-exported to bot: the frozen default `logger`
  (hardcodes `component: "worker-global"`; bot callers only use `createLogger`).

## Consequences

- One console-routing implementation; future level/method changes happen once.
- Bot and worker factories can no longer drift (single source).
- Log message content is unchanged; one disclosed routing note: the structured
  mirror previously used `console.debug` for debug entries and now uses
  `console.log` via `emitConsole` (same stdout destination — Node aliases
  `console.debug` to `console.log`; Workers captures both as log output).
  No test pins the old method; info/warn/error method routing is unchanged.
- `bot/lib/logger.ts` stays as the bot-tier entry point so bot imports are
  untouched (2 callers + `tests/unit/bot/lib-logger.test.ts` keep passing).
