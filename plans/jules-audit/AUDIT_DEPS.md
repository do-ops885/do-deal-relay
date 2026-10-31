# Track A — Dependency Audit Findings

| Package | Current | Available | Risk | Upgrade Safe? |
| --- | --- | --- | --- | --- |
| `@cloudflare/workers-types` | `5.20261023.1` | `5.20261031.1` | Low (Patch) | Yes |
| `@types/node` | `26.6.5` | `26.6.6` | Low (Patch) | Yes |
| `markdownlint-cli` | `0.49.1` | `0.50.0` | Low (Minor) | Yes |
| `wrangler` | `4.152.0` | `4.156.0` | Low (Minor) | Yes |
| `undici` (override) | `6.28.1` | `6.29.1` | Low (Patch) | Yes (resolves CVE-2026-109383, CVE-2026-109869, CVE-2026-87018) |

*Note: Major version upgrades (e.g. `vitest` 5.x) require human review and are excluded per audit policy.*
