# AUDIT_DOCS.md

- **Missing JSDoc**:
  - `worker/pipeline/score.ts`: `calculateSourceDiversity`, `calculateUniquenessScore`, `evolveSourceTrust` have some comments but could be more formal JSDoc with tags.
  - `worker/lib/global-logger.ts`: `setLogLevel`, `setLogContext`, `clearLogContext` are missing `@param` and `@returns`. `logger` object methods are missing JSDoc.
  - `worker/lib/nlq/ai/intent.ts`: `classifyIntent` is missing `@param`, `@returns`, `@throws`. `validateIntent` is missing JSDoc.

## Actions
- Add/Update JSDoc for the identified functions following the repo's style.
