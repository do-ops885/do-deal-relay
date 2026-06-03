# Code Quality Audit

## Magic Numbers & Constants
- worker/config.ts: HACKERNEWS rate limit uses a HACK comment.

## Deprecated Code
- worker/routes/webhooks.ts: Marked as deprecated. Should be removed if all functionality moved to worker/routes/webhooks/index.ts.

## File Length Violations (> 500 lines)
- worker/pipeline/discover.ts (552)
- worker/index.ts (538)
- worker/routes/referrals.ts (514)
- worker/routes/validation.ts (552)
- worker/types.ts (605)
- worker/lib/referral-storage/dual-write.ts (651)
- worker/lib/validation/url-validator.ts (738)
- worker/lib/validation/code-validator.ts (719)
- worker/lib/validation/reward-scraper.ts (763)
- worker/lib/d1/queries.ts (974)
- worker/lib/d1/migrations.ts (642)
- worker/lib/research-agent/fetcher.ts (1052)
- worker/lib/research-agent/types.ts (623)

## Untyped 'any'
- Found multiple 'any' usages in worker/lib/research-agent/fetcher.ts and worker/lib/research-agent/orchestrator.ts.

## Console Logs
- None found in production paths (checked worker/ directory).
