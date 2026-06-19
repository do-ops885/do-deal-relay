# ADR-014: User-Facing Discord/Telegram Error Fallback Pattern

**Status:** Adventised. Read-only audit (no implementation in this PR).

**Date:** 2026-06-18

**Deciders:** @buffy (audit), pending user approval for implementation

---

## Context

The audit identified 4 bot-tier callsites that share the inline pattern
`error instanceof Error ? error.message : "<fallback>"` to build
user-facing error messages for Discord and Telegram reply templates:

| File | Line | Fallback string |
|------|------|-----------------|
| `bot/api-client.ts` | 195 | `"Unknown error"` |
| `bot/conversations.ts` | 196 | `"Unknown error"` |
| `bot/conversations.ts` | 242 | `"Unknown error"` |
| `bot/discord/handlers.ts` | 159 | `"Research failed"` |

Each instance is mechanically equivalent — the only varying input is the
fallback string. `bot/api-client.ts` *already* defines a more sophisticated
`getErrorMessage(error)` helper that maps `APIClientError.statusCode` to a
status-specific user-friendly message (lines 503–526). That helper is not
applicable to these 4 sites because it's a downstream UX map on
`APIClientError`-typed throws, whereas the inline pattern is for *raw*
throws (`fetch` rejection, network failures, AbortError, etc.) that have not
yet been normalized into an `APIClientError`.

### Why this is distinct from `toErrMessage` (a9e5a18)

`toErrMessage(err)` — added in commit `a9e5a18` — uses `String(err)` as the
fallback for non-`Error` throws. For a `fetch` rejection whose `error`
property is `{ name: "AbortError", message: "..." }`, `String(err)` would
return `[object Object]` — unacceptable for a Discord reply shown to users.
The 4 audited sites explicitly want a *curated* fallback, not a coerced
`String()`. This is a distinct semantic setting.

## Decision

**Recommendation:** Add `toErrUserMessage(err, fallback): string` to
`bot/lib/errors.ts` (`worker/lib/errors.ts` already uses a different
fallback policy at the worker tier — no parity-mirror needed).

```ts
/**
 * Build a user-facing error message from any thrown value, using a
 * curated fallback string for non-`Error` throws (rather than `String(err)`,
 * which would surface `[object Object]` for plain-object throws).
 *
 * Equivalent to `error instanceof Error ? error.message : fallback`.
 * Use this for Discord/Telegram reply templates where the fallback copy
 * is part of the UX contract. For structured logger context, use
 * `toErrCtx`. For raw string-flattening, use `toErrMessage`.
 */
export function toErrUserMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
```

**Defer implementation:** Per the user's audit-only request, this ADR is
read-only output. Implementation is a separate atomic commit if the user
approves the recommendation. The follow-up would:

1. Add `toErrUserMessage` to `bot/lib/errors.ts` (1 export).
2. Add `tests/unit/bot/lib-errors.test.ts` cases (parity-mirror with worker
   — also fits the recently-back-filled bot errors test file from a9e5a18).
3. Migrate the 4 callsites (4 import additions, 4 one-line replacements).

### Rationale

- **Pattern is mechanical, not idiomatic.** 4 identical inline ternaries
  across 3 files is a duplication smell; a 3-line helper is a smaller
  surface than the 4 inline copies it replaces.
- **Confusion avoidance.** A future maintainer might copy
  `toErrMessage` (which yields `[object Object]` for plain-object throws)
  and unwittingly surface garbage to users. A named helper makes the
  intent — curated fallback — explicit at the call site.
- **Trivial cost.** ~10 lines of code, no cross-tier coupling, no
  structured-logger signature changes.
- **Decomposable.** Standalone helper in `bot/lib/errors.ts` does NOT
  require touching worker tier. No blast radius.

### Tradeoffs considered

- **Inline is more readable per call.** Some maintainers prefer seeing the
  ternary inline. Counter: 4 identical copies outweigh readability per
  call, and the helper name `toErrUserMessage(err, fallback)` reads as
  "Discord message + fallback" which is the intent.
- **Add a third helper to one tier (asymmetric).** Counter: `toErrUser`
  is bot-tier UX semantics; worker-tier has no such concept. Asymmetry is
  appropriate.
- **Defer indefinitely.** Counter: code is small; deferring here means
  future maintainers will continue to copy-paste the inline pattern when
  adding a 5th call site.

## Consequences

### Positive

- (+) Drift prevention: the per-call fallback string remains a parameter,
  not duplicated logic.
- (+) Discoverable: `bot/lib/errors.ts` becomes the canonical source for
  all bot-tier error-shaping helpers (`toErrCtx`, `toErrMessage`,
  `toErrUserMessage`).
- (+) Auto-documenting: the helper docstring explains the
  `String(err)`-vs-curated-fallback distinction.

### Negative

- (-) Slight helper-layer growth: 3 helpers in the module vs 2.
- (-) Slight migration churn: 4 import additions + 4 replacements + tests.

## Out-of-scope (separate ADR/PRs)

- **80+ worker/ inline `error instanceof Error ? .message : String(err)`
  patterns** — already noted as a separate follow-up in commit `a9e5a18`'s
  body. Different concern: logger-context shape (use `toErrCtx`), not
  user-facing fallback.
- **`getErrorMessage` consolidation** — `bot/api-client.ts` defines a
  `getErrorMessage` helper that maps `APIClientError.statusCode` to
  user-friendly messages. That helper operates on already-classified
  `APIClientError` instances; the 4 audited sites operate on raw throws.
  No consolidation opportunity at this audit step.

## References

- Commits: `a9e5a18` (toErrMessage migration),
  `5eb1ec5` (bot/errors.ts mirror creator),
  `5e5b91` (ws CVE follow-up chain).
- Files audited: `bot/api-client.ts`, `bot/conversations.ts`,
  `bot/discord/handlers.ts`.
- Pattern: cross-tier parity established by `worker/lib/errors.ts` and
  `bot/lib/errors.ts` (see `5eb1ec5`, `a9e5a18`).

## Implementation status

**Not implemented in this PR.** Atomic commit if/when user approves:
`chore(refactor): add toErrUserMessage helper for bot user-facing
fallbacks`. Touches: bot/lib/errors.ts (+1 export),
tests/unit/bot/lib-errors.test.ts (+N cases), bot/api-client.ts:195,
bot/conversations.ts:196,242, bot/discord/handlers.ts:159.
