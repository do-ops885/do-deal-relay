# AUDIT_QUALITY

## Actionable Findings

### Untyped Any
- `worker/lib/github/core.ts`: `author: any` in `getRecentCommits` response type.

### Source Files Exceeding MAX_SOURCE_FILE_LOC (500)
- `worker/lib/research-agent/fetcher.ts`: 1106 lines
- `worker/lib/d1/queries.ts`: 974 lines
- `worker/lib/d1/migrations.ts`: 799 lines
- `worker/lib/validation/reward-scraper.ts`: 763 lines
- `worker/lib/validation/url-validator.ts`: 738 lines
- `worker/lib/validation/code-validator.ts`: 719 lines
- `worker/types.ts`: 681 lines
- `worker/lib/referral-storage/dual-write.ts`: 651 lines
- `worker/lib/research-agent/types.ts`: 640 lines
- `worker/lib/research-agent/orchestrator.ts`: 559 lines
- `worker/routes/validation.ts`: 552 lines
- `worker/pipeline/discover.ts`: 552 lines
- `worker/index.ts`: 549 lines
- `worker/routes/referrals.ts`: 527 lines
- `worker/lib/mcp/types.ts`: 513 lines
- `worker/lib/d1/client.ts`: 512 lines

### TODO / FIXME / HACK / DEPRECATED
- `worker/routes/webhooks.ts`: DEPRECATED marker (wrapper file).
- `tests/unit/d1-queries.test.ts`: TODO to fix `getDealStats` tests.

### Magic Numbers
- Multiple scoring weights in `worker/pipeline/score.ts` (already mentioned in memory as partially addressed, but more may remain).

## Non-Actionable / False Positives
- `worker/config.ts`: `HACKERNEWS` constant (triggered HACK check).
- `worker/lib/logger/structured.ts`: `console.log` used for intentional output.
- `worker/lib/global-logger.ts`: `console.log` used for intentional output.
