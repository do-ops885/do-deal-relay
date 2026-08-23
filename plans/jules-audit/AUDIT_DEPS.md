# Track A — Dependency Audit Report — 2026-08-20

## Summary
Audited dependency manifests (`package.json`, `package-lock.json`).

## Safe Upgrades To Apply

| Package | Current | Available | Risk | Upgrade Safe? |
|---|---|---|---|---|
| `@cloudflare/workers-types` | `5.20260815.1` | `5.20260820.1` | Low (Patch) | Yes |
| `vitest` | `4.1.10` | `4.1.11` | Low (Patch) | Yes |
| `@vitest/coverage-v8` | `4.1.10` | `4.1.11` | Low (Patch) | Yes |
| `undici` (override) | `6.27.0` | `6.28.0` | Low (Patch CVE fix) | Yes |

## Human Review Required (Deferred)

| Package | Current | Available | Reason Deferred |
|---|---|---|---|
| `zod` | `3.25.76` | `4.4.3` | Major version upgrade with breaking API changes |
| `miniflare` | `4.20260730.0` | `5.20260815.0-alpha` | Major/Alpha version upgrade |
| `@cloudflare/vitest-pool-workers` | `0.21.3` | `0.22.0` | Minor framework version upgrade |
| `wrangler` | `4.123.0` | `4.124.0` | Minor CLI tool version upgrade |
