# Track B - Code Quality

- **File Length Limits**:
  - `worker/pipeline/discover.ts` (561 lines) exceeds 500-line limit.
  - `worker/routes/validation.ts` (552 lines) exceeds 500-line limit.
- **Untyped Any**:
  - `worker/lib/github/core.ts:249`: `author: any` needs typing.
- **TODOs**:
  - `tests/unit/d1-queries.test.ts:726`: Fix getDealStats tests.
- **Deprecated Code**:
  - `worker/routes/webhooks.ts`: Thin wrapper, use `worker/routes/webhooks/index.ts`.

