# Track A — Dependency Audit - 2026-07-28

The dependency audit identifies standard patch-level upgrades to ensure security and alignment with ecosystem conventions.

## Actionable Findings

| Package | Current | Available | Risk | Upgrade Safe? |
|---|---|---|---|---|
| `@types/node` | `26.1.0` | `26.1.1` | Low | Yes |
| `prettier` | `3.9.4` | `3.9.5` | Low | Yes |
| `markdownlint-cli` | `0.49.0` | `0.49.1` | Low | Yes |
| `@cloudflare/workers-types` | `5.20260713.1` | `5.20260715.1` | Low | Yes |
| `protobufjs` | `8.7.0` | `8.7.1` | Low | Yes |
| `js-yaml` | `5.2.1` | `5.2.2` | High (Vulnerability Fix) | Yes |

*Note: js-yaml is upgraded to 5.2.2 to resolve a high-severity denial-of-service vulnerability (GHSA-pm4m-ph32-ghv5).*
