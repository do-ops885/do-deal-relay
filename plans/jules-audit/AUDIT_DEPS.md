# Dependency Audit — 2026-10-08

The following safe patch/minor upgrades were detected without API breaking changes:

| Package | Current | Available | Risk | Upgrade Safe? |
|---|---|---|---|---|
| `@cloudflare/workers-types` | `5.20261004.1` | `5.20261008.1` | Low | Yes (patch update) |
| `js-yaml` | `5.4.2` | `5.4.3` | Low | Yes (patch update) |
| `wrangler` | `4.147.0` | `4.148.0` | Low | Yes (minor/patch update) |

## Skipped / Human Review Required
- `@cloudflare/vitest-pool-workers`: `0.22.0` -> `0.23.0` (evaluated; deferring to keep lockstep ecosystem release)
- `vitest` / `@vitest/coverage-v8`: `4.1.11` -> `5.0.3` (major version upgrade)
- `miniflare`: `4.20260730.0` -> `5.20261006.0-alpha` (alpha version)
