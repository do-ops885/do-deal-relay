# AUDIT_QUALITY

## Tags (TODO/FIXME/HACK/DEPRECATED)
- `worker/routes/webhooks.ts`: Marked as DEPRECATED. Should be removed or confirmed if still needed for backwards compatibility.

## Console Logs in Production
- `worker/pipeline/score.ts:222`: `console.log` present in pipeline logic.
- `worker/publish.ts:135`: `console.log` present in publish logic.
- `worker/lib/circuit-breaker.ts:65, 323`: `console.log` used for state changes.
- `worker/lib/logger/structured.ts:77` & `worker/lib/global-logger.ts:84`: Intentional fallback console logs.

## Untyped `any`
- `worker/pipeline/validate-fast-path.ts:34`: `metrics?: any;` in `FastPathContext`.
- `worker/lib/github/workflows.ts:23`: `workflow_runs: any[]` in API response.
- `worker/lib/github/core.ts:249`: `author: any` in commit metadata.

## File Sizes
- All source files are currently under the 500-line limit defined in `AGENTS.md`. Largest is `worker/lib/webhook-sdk.ts` at 477 lines.

## Magic Numbers
- `worker/config.ts`: Various numeric constants are defined here (e.g., `HACKERNEWS: 100`), which is the correct place for them, but some inline numbers in logic should be checked.
