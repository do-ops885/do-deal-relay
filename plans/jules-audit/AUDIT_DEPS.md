# AUDIT_DEPS

| package | current | available | risk | upgrade safe? |
|---------|---------|-----------|------|---------------|
| @cloudflare/vitest-pool-workers | 0.16.12 | 0.16.13 | Low | Yes (patch) |
| @cloudflare/workers-types | 4.20260603.1 | 4.20260609.1 | Low | Yes (patch) |
| @types/node | 25.9.1 | 25.9.2 | Low | Yes (patch) |
| miniflare | 4.20260601.0 | 4.20260603.0 | Low | Yes (patch) |
| wrangler | 4.97.0 | 4.98.0 | Low | Yes (patch) |

## Human Review Required
- `protobufjs`: 8.5.0 → 8.6.1 (Minor upgrade, but may have API changes)
- `zod`: 3.25.76 → 4.4.3 (Major upgrade required)
