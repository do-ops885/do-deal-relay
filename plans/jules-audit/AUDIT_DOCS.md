# AUDIT_DOCS

## Missing JSDoc Comments
- `worker/pipeline/score.ts`: `calculateUniquenessScore`, `evolveSourceTrust`
- `worker/pipeline/stage.ts`: `prepareSnapshot`
- `worker/pipeline/dedupe.ts`: `deduplicate`
- `worker/validation/gates/duplicate-check.ts`: `checkDeduplication`
- `worker/validation/gates/idempotency-check.ts`: `checkIdempotency`
- `worker/email/templates/commands.ts`: `createSuccessConfirmation`, `createDeactivationConfirmation`

Most core entry points (discover, validate, publish) have JSDoc, but internal pipeline helper functions are often missing formal documentation.
