# Track D - Documentation

- **Missing JSDoc**:
  - `worker/lib/storage.ts`: Checked, but most functions have documentation.
  - `worker/pipeline/score.ts`: Checked, but functions have documentation.
- **Action**:
  - I will perform a deeper dive to find truly undocumented public APIs in the next step if I find any.
  - Actually, looking at the previous grep, `worker/routes/webhooks.ts` is marked as DEPRECATED but lacks a JSDoc `@deprecated` tag. I will add it.
