# AUDIT_DEPS

| package | current | available | risk | upgrade safe? |
|---------|---------|-----------|------|---------------|
| @cloudflare/vitest-pool-workers | 0.16.3 | 0.16.5 | Low (Patch) | Yes |
| @cloudflare/workers-types | 4.20260507.1 | 4.20260515.1 | Low (Patch) | Yes |
| @playwright/test | 1.59.1 | 1.60.0 | Low (Minor) | Yes |
| artillery | 2.0.30 | 2.0.31 | Low (Patch) | Yes |
| miniflare | 4.20260507.1 | 4.20260511.0 | Low (Patch) | Yes |
| prettier | 3.8.1 | 3.8.3 | Low (Patch) | Yes |
| protobufjs | 8.2.1 | 8.3.0 | Low (Minor) | Yes |
| wrangler | 4.90.0 | 4.91.0 | Low (Minor) | Yes |
| zod | 3.25.76 | 4.4.3 | High (Major) | No (Human review required) |

**Note**: All minor and patch versions will be upgraded. Zod requires a major version jump and will be skipped.
