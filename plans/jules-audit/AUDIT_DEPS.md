# Dependency Audit - 2026-07-06

## Summary
- **Vulnerabilities**: 0 (moderate or higher)
- **Safe Upgrades**: 7 packages (patch/minor)
- **Human Review Required**: 2 packages (major)

## Safe Upgrades (Actionable)

| Package | Current | Available | Risk | Upgrade Safe? |
|---------|---------|-----------|------|---------------|
| @cloudflare/vitest-pool-workers | 0.17.0 | 0.18.0 | Low | Yes (Minor) |
| @playwright/test | 1.61.0 | 1.61.1 | Low | Yes (Patch) |
| @types/node | 26.0.1 | 26.1.0 | Low | Yes (Minor) |
| js-yaml | 5.2.0 | 5.2.1 | Low | Yes (Patch) |
| miniflare | 4.20260630.0 | 4.20260701.0 | Low | Yes (Minor) |
| protobufjs | 8.6.5 | 8.6.6 | Low | Yes (Patch) |
| wrangler | 4.106.0 | 4.107.0 | Low | Yes (Minor) |

## Human Review Required (Major)

| Package | Current | Latest | Reason |
|---------|---------|--------|--------|
| @cloudflare/workers-types | 4.20260630.1 | 5.20260706.1 | Major version bump. |
| zod | 3.25.76 | 4.4.3 | Major version bump. |
