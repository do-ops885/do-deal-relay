# Track B - Code Quality

## File Length Violations (> 500 lines)
- worker/pipeline/discover.ts (552 lines) - Action: Refactor to reduce size.

## Magic Numbers
- worker/state-machine.ts:108: 300 (lock extension)
- worker/state-machine.ts:190: 1000 (retry delay)
- worker/pipeline/discover.ts:239: 3 (concurrency)
- worker/pipeline/normalize.ts:166: 4, 50 (code length)
- worker/pipeline/dedupe.ts:40, 41, 42: 25, 100, 500 (value tiers)

## Untyped 'any'
- worker/lib/github/workflows.ts:23: workflow_runs: any[]
- worker/lib/github/core.ts:249: author: any

## TODO/FIXME/HACK
- worker/config.ts:46: HACKERNEWS (HACK)
- worker/routes/webhooks.ts:4: DEPRECATED
