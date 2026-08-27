# Track A — Dependency Audit
Date: 2026-08-27

## Findings Summary
All available dependency updates are either minor/patch updates or require major version human review.

| Package | Current | Available | Risk | Upgrade Safe? |
|---|---|---|---|---|
| `@cloudflare/workers-types` | 5.20260821.1 | 5.20260827.1 | Low (Patch) | Yes |
| `@types/node` | 26.2.0 | 26.4.0 | Low (Minor) | Yes |
| `js-yaml` | 5.3.0 | 5.4.1 | Low (Minor) | Yes |
| `wrangler` | 4.125.0 | 4.126.0 | Low (Minor) | Yes |
| `miniflare` | 4.20260730.0 | 5.20260825.0-alpha | High (Major/Alpha) | No — Human review required |
| `protobufjs` | 8.7.2 | 8.8.0 | Low (Minor) | Yes |
| `zod` | 3.25.76 | 4.4.3 | High (Major) | No — Human review required |

## Actionable Upgrades Included in Track A
- `@cloudflare/workers-types`: `5.20260821.1` -> `5.20260827.1`
- `@types/node`: `26.2.0` -> `26.4.0`
- `js-yaml`: `5.3.0` -> `5.4.1`
- `wrangler`: `4.125.0` -> `4.126.0`
- `protobufjs`: `8.7.2` -> `8.8.0`
