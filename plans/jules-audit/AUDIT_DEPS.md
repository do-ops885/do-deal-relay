# AUDIT_DEPS.md

## Dependency Scan Results

| Package | Current | Available | Risk | Upgrade Safe? |
| --- | --- | --- | --- | --- |
| `@cloudflare/workers-types` | `5.20261008.1` | `5.20261011.1` | Low | Yes (Patch) |
| `@types/node` | `26.6.4` | `26.6.5` | Low | Yes (Patch) |
| `prettier` | `3.9.9` | `3.9.10` | Low | Yes (Patch) |
| `wrangler` | `4.148.0` | `4.149.0` | Low | Yes (Minor) |

## Human Review Required
- `vitest` / `@vitest/coverage-v8` (4.1.11 -> 5.0.3 major version bump)
- `@cloudflare/vitest-pool-workers` (0.22.0 -> 0.23.0 minor version bump)
- `miniflare` (4.20260730.0 -> 5.20261006.1-alpha alpha release)
