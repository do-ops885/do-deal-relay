/**
 * Bot-tier logger entry point.
 *
 * Single-sourced from `worker/lib/global-logger.ts` (see ADR-025): the
 * factory, levels, and console routing live in exactly one place so the two
 * tiers cannot drift. Only `createLogger` and the types are re-exported —
 * the frozen worker default `logger` (hardcoded `component:
 * "worker-global"`) is deliberately omitted so bot logs are never
 * mislabelled. Pure Node runtime (no KV / Env); output goes to stdout /
 * stderr via `console.*` underneath.
 */

export { createLogger, emitConsole } from "../../worker/lib/global-logger";
export type {
  LogContext,
  Logger,
  LoggerOptions,
  LogLevel,
} from "../../worker/lib/global-logger";
