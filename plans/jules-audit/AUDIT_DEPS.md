# Dependency Audit

## Findings

| Package | Current | Available | Risk | Safe to Upgrade? |
| --- | --- | --- | --- | --- |
| `@cloudflare/workers-types` | 5.20261016.1 | 5.20261023.1 | Low | Yes (patch) |
| `wrangler` | 4.151.0 | 4.152.0 | Low | Yes (minor) |
| `vitest` | 4.1.12 | 5.0.5 | High | Human review required (major) |
| `@vitest/coverage-v8` | 4.1.12 | 5.0.5 | High | Human review required (major) |

## Actionable Changes
Upgrade `@cloudflare/workers-types` to `5.20261023.1` and `wrangler` to `4.152.0` in `package.json`.
