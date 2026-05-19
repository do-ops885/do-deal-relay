# AUDIT_QUALITY.md

- **File Size Limits**: The following files exceed the 500-line limit:
  - `worker/lib/research-agent/fetcher.ts` (977 lines)
  - `worker/lib/d1/queries.ts` (974 lines)
  - `worker/lib/validation/reward-scraper.ts` (763 lines)
  - `worker/lib/validation/url-validator.ts` (738 lines)
  - `worker/lib/validation/code-validator.ts` (719 lines)
  - `worker/lib/referral-storage/dual-write.ts` (653 lines)
  - `worker/lib/d1/migrations.ts` (642 lines)
  - `worker/lib/research-agent/types.ts` (623 lines)
  - `worker/types.ts` (602 lines)

- **TODO/FIXME Check**:
  - `worker/config.ts`: `HACKERNEWS: DEFAULT_HN_RATE_LIMIT` (HACK mentioned)
  - `worker/routes/webhooks.ts`: `DEPRECATED: This file is a thin wrapper.`

- **Untyped `any`**:
  - `worker/lib/github/workflows.ts`: `(run: any)`
  - `worker/lib/github/core.ts`: `author: any`

- **Magic Numbers**:
  - Many files likely contain magic numbers (e.g., timeout values, score thresholds) that aren't extracted to constants.

## Actions
- Extract constants for magic numbers where obvious.
- Address untyped `any` if easy to fix.
- Note: Large file refactoring is a major task and might exceed the "balanced effort" for an overnight health check, but I'll flag them.
