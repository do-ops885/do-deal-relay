# PEV Spec — RL-1: Native Rate Limiting Binding

## Task

**Title**: Close RL-1 (KV check-then-set race) via Workers Rate Limiting binding
**Author**: goap-orchestrator
**Date**: 2026-09-06
**Priority**: high

## Goal

Eliminate the KV read-modify-write race in `worker/lib/rate-limit.ts` by routing standard 60-second endpoint limits through the native Workers Rate Limiting binding, keeping KV as fallback for non-conforming cases.

## Approach

Add `ratelimits` bindings (one per distinct 60s limit value) and a small selector module; `checkRateLimit` prefers a matching binding and falls back to the existing KV path when no binding fits (300s windows, per-key overrides, absent bindings in local/test).

## Non-Goals

- [ ] Not touching the 300s-window endpoints' semantics (`/api/discover`, `/api/validate/batch` stay on KV)
- [ ] Not removing the KV implementation (required fallback + per-key custom limits)
- [ ] Not migrating `rate-limit-kv.ts` consumers (separate consolidation item)
- [ ] Not changing any endpoint's limit values or the 429 response shape
- [ ] Not implementing DO-based rate limiting (anti-pattern per official docs; ADR-028)

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | ADR-028: supersede ADR-017 rate-limit scope | plans/ADR-028-*.md | low |
| 2 | Add `ratelimits` bindings (top-level + dev/staging/production envs) | wrangler.jsonc | low |
| 3 | Add optional `RateLimit` bindings to Env | worker/types/api.ts | low |
| 4 | New selector module: map endpoint config → binding | worker/lib/rate-limit-binding.ts | low |
| 5 | `checkRateLimit`: binding-first, KV fallback; fail-closed on sensitive endpoints preserved | worker/lib/rate-limit.ts | medium |
| 6 | Unit tests for binding path + fallback matrix | tests/unit/rate-limit-binding.test.ts | low |
| 7 | GOAP_STATE update (RL-1 → CLOSED), metrics entry | plans/GOAP_STATE.md | low |

## Binding Layout

One namespace per distinct (limit, 60s) pair used by `ENDPOINT_LIMITS`:

| Binding | limit/period | Serves |
|---------|--------------|--------|
| RL_5_60 | 5/60 | /api/auth/register |
| RL_10_60 | 10/60 | /api/submit, /api/auth/login, /api/nlq, /api/semantic-search |
| RL_20_60 | 20/60 | /api/research, /api/email/parse, /api/validate/url, /api/auth/refresh, /api/experience |
| RL_30_60 | 30/60 | /api/email/incoming |
| RL_50_60 | 50/60 | /webhooks/incoming |
| RL_60_60 | 60/60 | /deals |
| RL_100_60 | 100/60 | default |

Key passed to `limit()`: `${keyPrefix}:${identifier}` (stable identifier per official best practice — user ID preferred over IP, unchanged from current `getClientIdentifier`).

## Behavioral Notes

- The binding returns only `{ success }`; `remaining` is approximated as `limit - 1` on allow and `0` on deny. `X-RateLimit-Remaining` becomes advisory on the binding path (documented in ADR-028). `Retry-After`/`resetTime` continue to use window-boundary arithmetic.
- Binding errors follow the existing KV-error policy: fail-closed for `SENSITIVE_ENDPOINTS`, fail-open otherwise — then fall back to KV, preserving prior behavior.
- Local/test surfaces without bindings behave exactly as today (KV path or no-op when DEALS_LOCK absent).

## Acceptance Criteria

1. `npx tsc --noEmit` clean; prettier clean.
2. Existing `tests/unit/rate-limit.test.ts` passes unchanged (KV path intact).
3. New tests cover: binding allow, binding deny (429 shape unchanged), 300s window bypasses binding, per-key config bypasses binding, binding absent → KV, binding throws → sensitive fail-closed / non-sensitive KV fallback.
4. No file exceeds 500 lines.
5. GOAP_STATE RL-1 marked CLOSED with ADR-028 reference.
