# Track C — Test Coverage Audit
Date: 2026-08-27

## Uncovered Logic Identified
`worker/lib/research-agent/helpers.ts` contains core business functions lacking unit test coverage:
1. `normalizeResearchQuery` - Normalizes query string by injecting domain if missing and replacing synonym terms (`invite` -> `referral`, `promo` -> `referral`, `promotion` -> `referral program`).
2. `generateSearchQueries` - Generates source-specific search query variants (`producthunt`, `reddit`, `hackernews`, `github`, `default`).
3. `extractRewardValue` - Extracts monetary numeric value (currency amount or percentage) from reward summary strings.

## Actionable Plan
Add unit tests in `tests/unit/research-agent-helpers.test.ts` to thoroughly test `normalizeResearchQuery`, `generateSearchQueries`, and `extractRewardValue`.
