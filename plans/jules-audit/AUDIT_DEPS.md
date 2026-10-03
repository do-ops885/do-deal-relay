# Dependency Audit Findings (Track A)

Date: 2026-10-03

## Findings

| Package | Current | Available | Risk | Upgrade Safe? | Action |
| --- | --- | --- | --- | --- | --- |
| `@cloudflare/workers-types` | `5.20261002.1` | `5.20261003.1` | Low | Yes | Upgrade in package.json |
| `wrangler` | `4.146.0` | `4.147.0` | Low | Yes | Upgrade in package.json |
| `vitest` | `4.1.11` | `5.0.3` | High | No (Major version upgrade) | Human review required |
| `@vitest/coverage-v8` | `4.1.11` | `5.0.3` | High | No (Major version upgrade) | Human review required |
| `miniflare` | `4.20260730.0` | `5.20261001.0-alpha` | High | No (Alpha major release) | Human review required |

## Summary
Safe patch/minor upgrades found for `@cloudflare/workers-types` and `wrangler`.
