# AUDIT_QUALITY.md

## Code Quality Audit Findings

1. `worker/routes/core/submit.ts`:
   - `parseInt(contentLength)` is missing explicit radix 10 parameter.
   - `1024 * 1024` magic number for maximum submit payload body size should be extracted to named constant `MAX_SUBMIT_BODY_SIZE_BYTES`.
