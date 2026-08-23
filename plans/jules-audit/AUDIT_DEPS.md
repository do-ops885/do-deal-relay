# Track A — Dependency Audit Report

## Audit Findings

| Package | Current | Available | Risk | Upgrade Safe? |
| --- | --- | --- | --- | --- |
| `@cloudflare/workers-types` | `5.20260815.1` | `5.20260823.1` | Low | Yes (safe patch) |
| `@cloudflare/vitest-pool-workers` | `0.21.3` | `0.22.0` | Low | Yes (safe minor) |
| `@vitest/coverage-v8` | `4.1.10` | `4.1.11` | Low | Yes (safe patch) |
| `vitest` | `4.1.10` | `4.1.11` | Low | Yes (safe patch) |
| `wrangler` | `4.123.0` | `4.125.0` | Low | Yes (safe minor) |
| `zod` | `3.25.76` | `4.4.3` | High | No (human review required - major version) |
| `miniflare` | `4.20260730.0` | `5.20260820.0-alpha` | High | No (human review required - major/alpha release) |

## Actionable Safe Upgrades
- `@cloudflare/workers-types@5.20260823.1`
- `@cloudflare/vitest-pool-workers@0.22.0`
- `@vitest/coverage-v8@4.1.11`
- `vitest@4.1.11`
- `wrangler@4.125.0`
