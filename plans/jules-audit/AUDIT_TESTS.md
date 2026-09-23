# Test Coverage Audit Artifact (Track C)

## Uncovered / Under-tested Modules Identified
`worker/lib/research-agent/helpers.ts` contains utility functions used by research agent pipelines (`normalizeResearchQuery`, `generateSearchQueries`, `generatePotentialCodes`, `extractRewardValue`, `getDefaultResearchConfig`) that lack isolated unit test coverage.

## Actions Planned
Write comprehensive unit tests in `tests/unit/research-agent-helpers.test.ts` covering:
1. `normalizeResearchQuery` - lowercasing, domain prefixing, and term normalization (`invite` -> `referral`, `promo` -> `referral`, `promotion` -> `referral program`).
2. `generateSearchQueries` - source-specific query generation for producthunt, reddit, hackernews, github, and default sources.
3. `generatePotentialCodes` - code generation count based on depth (`quick`, `thorough`, `deep`) for known vs unknown programs.
4. `extractRewardValue` - parsing dollar amounts, percentages, and missing reward summaries.
5. `getDefaultResearchConfig` - default configuration values and source weights.
