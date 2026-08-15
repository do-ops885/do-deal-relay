# Audit Track A: Dependency Audit

Date: 2026-08-15
Repository: do-deal-relay v0.1.8

| Package | Current | Available | Risk | Upgrade Safe? | Notes |
|---------|---------|-----------|------|---------------|-------|
| `@cloudflare/workers-types` | `5.20260808.1` | `5.20260815.1` | Low | Yes | Patch-level types update |
| `protobufjs` | `8.7.1` | `8.7.2` | Low | Yes | Patch-level update |
| `js-yaml` | `5.2.3` | `5.3.0` | Low | Yes | Minor-level update |
| `artillery` | `2.0.33` | `2.0.34` | Low | Yes | Development dependency patch update |

## Human Review Required (Major Upgrades Deferred)
- `zod`: `3.25.76` → `4.4.3` (Major version update required human review for breaking API changes)
- `@cloudflare/vitest-pool-workers`: `0.19.1` → `0.21.3` (Ecosystem sync)
- `wrangler`: `4.116.0` → `4.123.0` (Ecosystem sync)
