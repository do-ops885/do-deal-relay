/**
 * Helpers for normalizing thrown values into a structured context shape.
 *
 * Shared across the Worker tier (`worker/**`). Mirrors
 * `bot/lib/errors.ts` so both tiers use the same `toErrCtx` semantics for
 * shaping caught values into a logger-friendly `ErrContext`. This keeps
 * the cross-tier parity established for the structured logger (see
 * `worker/lib/global-logger.ts` and `bot/lib/logger.ts`).
 *
 * Note: `worker/lib/sanitize-error.ts` provides `toError` (wraps a
 * thrown value as an `Error` instance for catch-block narrowing) — a
 * different concern from `toErrCtx` (returns a context shape for the
 * structured logger). Both helpers coexist; migration of inline
 * `error instanceof Error ? error.message : String(error)` patterns to
 * `toErrCtx` is tracked as a follow-up.
 */

/**
 * Discriminated union covering the two shapes `toErrCtx` can produce.
 * Tightens a previous `Record<string, unknown>` return so callers get a
 * structural contract rather than an open bag of properties.
 */
export type ErrContext =
  | { name: string; message: string; stack?: string }
  | { value: string };

/**
 * Normalize any thrown value into a structured logger context.
 *
 * Preserves `Error.name` / `Error.message` / `Error.stack` for `Error`
 * instances, and falls back to `{ value: String(err) }` for unknown
 * throws (strings, plain objects, network errors thrown by fetch, etc.).
 */
export function toErrCtx(err: unknown): ErrContext {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: String(err) };
}
