/**
 * Helpers for normalizing thrown values into a structured context shape.
 *
 * Shared across the Worker tier (`worker/**`). Mirrors
 * `bot/lib/errors.ts` so both tiers use the same `toErrCtx` and
 * `toErrMessage` semantics for shaping caught values.
 *
 * Note: `worker/lib/sanitize-error.ts` provides `toError` (wraps a
 * thrown value as an `Error` instance for catch-block narrowing) — a
 * different concern from `toErrCtx` (returns a context shape for the
 * structured logger) and `toErrMessage` (returns a single-string
 * flattening matching legacy `error instanceof Error ? error.message :
 * String(error)` patterns). The three helpers coexist; pick by output
 * shape needed.
 */

/**
 * Discriminated union covering the two shapes `toErrCtx` can produce.
 * Tightens a previous `Record<string, unknown>` return so callers get a
 * structural contract rather than an open bag of properties.
 */
export type ErrContext =
  { name: string; message: string; stack?: string } | { value: string };

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

/**
 * Flatten any thrown value to a single-string error message.
 *
 * Equivalent to `error instanceof Error ? error.message : String(error)`
 * — preserves the visual contract of legacy `console.error` and throw-list
 * templates such as `` `Network error: ${String(error)}` ``. For structured
 * contexts (the structured logger) prefer `toErrCtx` which preserves
 * `name` + `stack`. For Error-instance normalization (e.g. catch-block
 * narrowing) use `toError` from `worker/lib/sanitize-error`.
 */
export function toErrMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
