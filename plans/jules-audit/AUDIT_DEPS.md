# AUDIT_DEPS.md

| package | current | available | risk | upgrade safe? |
| :--- | :--- | :--- | :--- | :--- |
| @cloudflare/workers-types | 4.20260518.1 | 4.20260519.1 | Low | Yes (patch) |
| protobufjs | 8.3.0 | 8.4.0 | Low | Yes (minor) |
| zod | 3.25.76 | 4.4.3 | High | Human review required (major) |

## Vulnerabilities
- `ws`: Moderate severity (Uninitialized memory disclosure). **Fixed by pinning to 8.20.1 in overrides.**

## Actions
- Upgrade `@cloudflare/workers-types` to `4.20260519.1`.
- Upgrade `protobufjs` to `8.4.0`.
- Pin `ws` to `8.20.1` to resolve GHSA-58qx-3vcg-4xpx.
