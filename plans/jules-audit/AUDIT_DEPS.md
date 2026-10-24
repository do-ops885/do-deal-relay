# Dependency Audit (Track A)

- **Date**: 2026-10-24
- **Auditor**: Jules Overnight Codebase Health Audit

## Safe Upgrades Identified

| Package | Current Version | Available Version | Risk Level | Safe Upgrade? |
| --- | --- | --- | --- | --- |
| `@cloudflare/workers-types` | `5.20261016.1` | `5.20261024.1` | Low | Yes (patch update) |
| `wrangler` | `4.151.0` | `4.152.0` | Low | Yes (minor update) |

## Skipped / Human Review Required

| Package | Current Version | Available Version | Reason |
| --- | --- | --- | --- |
| `vitest` | `4.1.12` | `5.0.5` | Major version bump (v4 -> v5) |
| `@vitest/coverage-v8` | `4.1.12` | `5.0.5` | Major version bump (v4 -> v5) |
