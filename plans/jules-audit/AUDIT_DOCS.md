# Documentation Audit

## Missing JSDoc for Public APIs
- worker/lib/nlq/index.ts: Re-exports lack JSDoc descriptions.
- worker/lib/cache.ts: Some exported methods missing @param/@returns.
- worker/lib/auth.ts: Validation helpers missing doc comments.

## Actionable
- Add JSDoc to worker/lib/nlq/index.ts barrel file.
