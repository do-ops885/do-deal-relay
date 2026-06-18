/**
 * Helpers for normalizing thrown values into a structured context shape.
 *
 * Shared between `bot/discord/index.ts` and `bot/telegram/index.ts`.
 * Both bots funnel `Error`-typed throws (and unknown throws) through
 * `toErrCtx` so the structured logger downstream sees `{ name, message,
 * stack }` for `Error` instances and `{ value }` for non-`Error` throws.
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
