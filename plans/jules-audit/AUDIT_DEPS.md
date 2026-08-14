# Dependency Audit - 2026-08-14

## Findings

The following dependencies are outdated or have safe minor/patch upgrades:

| Package | Current | Available | Risk | Upgrade Safe? |
| --- | --- | --- | --- | --- |
| `protobufjs` | `8.7.1` | `8.7.2` | Low | Yes (patch update) |
| `@cloudflare/workers-types` | `5.20260808.1` | `5.20260814.1` | Low | Yes (patch update) |
| `undici` (override) | `6.27.0` | `6.28.0` | Low (resolves vulnerabilities) | Yes (patch update) |

## Major Updates (Human Review Required)
- `zod`: `3.25.76` -> `4.4.3` (SemVer Major)
- `@cloudflare/vitest-pool-workers`: `0.19.1` -> `0.21.3` (SemVer Minor/Major ecosystem alignment)
- `miniflare`: `4.20260730.0` -> `5.20260811.1-alpha` (Alpha / SemVer Major)
- `wrangler`: `4.116.0` -> `4.123.0` (SemVer Minor/Major ecosystem alignment)
