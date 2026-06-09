# AUDIT_DOCS

## Missing Doc Comments (Public APIs)

### Pipeline & Validation
- `worker/pipeline/score.ts`: `calculateSourceDiversity`, `calculateUniquenessScore`
- `worker/pipeline/normalize.ts`: `normalize`, `verifyNormalization`
- `worker/validation/pipeline.ts`: `shouldQuarantine`, `calculateValidationRatio`
- `worker/validation/gates/*.ts`: Most gate functions (`validateFreshness`, `validateSchema`, etc.)

### Email System
- `worker/email/extraction.ts`: `extractUrls`, `extractReferralUrl`, `detectService`, etc.
- `worker/email/templates/*.ts`: Confirmation and error email creators.

### MCP & Middleware
- `worker/routes/mcp/utils.ts`: Response creators and validators.
- `worker/middleware/authorization.ts`: `hasPermission`, `authorize`.
