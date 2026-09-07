# ADR-028: Native Rate Limiting Binding Supersedes DO Migration for RL-1

**Date**: 2026-09-06
**Status**: Accepted
**Supersedes**: ADR-017 (rate-limiting scope only; the PipelineLock DO disposition in ADR-022 is unaffected)
**Related**: RL-1 in plans/GOAP_STATE.md

## Context

RL-1 identified a check-then-set race in `worker/lib/rate-limit.ts`: the KV
counter is read, compared, and written non-atomically, so concurrent isolates
can undercount and admit requests beyond the configured limit. ADR-017
(2026-07-07) proposed migrating rate limiting to a Durable Object. The DO RPC
attempt was reverted in review (`SourceRegistry` does not extend
`DurableObject`, stub RPC fails at runtime, fail-closed 503s health checks)
and RL-1 has been deferred since.

Official Cloudflare guidance published since ADR-017 changes the picture:

1. Rules of Durable Objects now lists a global DO rate limiter as an explicit
   anti-pattern: a single instance serializes all traffic and caps at roughly
   500-1000 req/s. Sharding per client would mean one DO per client key —
   overhead without benefit for this workload.
   (developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
2. Workers ships a first-class Rate Limiting binding (`ratelimits` config,
   `env.LIMITER.limit({ key })`): counters are cached on the machine running
   the Worker and synchronized asynchronously within the colo. No network
   round-trip, no read-modify-write race in user code.
   (developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
3. The binding's documented best practice — key on stable identifiers (user
   ID, API key, route) rather than IP where possible — matches the existing
   `getClientIdentifier` scheme (`user:{id}` preferred, `ip:{addr}` fallback).

## Decision

Use the native Rate Limiting binding as the primary enforcement path for all
standard 60-second endpoint limits. Keep the KV implementation as an
automatic fallback for:

- endpoints with 300-second windows (`/api/discover`, `/api/validate/batch`)
  — the binding only supports 10s and 60s periods;
- per-key custom limits from API-key metadata (arbitrary maxRequests);
- deploy surfaces without the bindings (local dev, unit tests).

Do not migrate rate limiting to Durable Objects. ADR-017 remains valid for
its lock-migration content (PipelineLock, per ADR-022); its rate-limit
migration plan is retired by this ADR.

## Consequences

Positive:

- The undercount race disappears on the binding path; enforcement is handled
  by the runtime's colo-local counters instead of user-space check-then-set.
- Zero added latency (counters are machine-local per official docs), versus
  one to two KV round-trips per request today.
- KV read/write volume drops on every rate-limited endpoint.

Negative / accepted trade-offs:

- The binding is eventually consistent across a colo and intentionally
  permissive; it is not an accounting system. This matches the existing KV
  behavior (which was also eventually consistent) and is acceptable for
  abuse protection.
- The binding returns only success/failure. `X-RateLimit-Remaining` becomes
  advisory (limit-1 on allow, 0 on deny) on the binding path. `Retry-After`
  keeps window-boundary arithmetic. No known client parses Remaining for
  flow control.
- Two enforcement paths exist because 300s endpoints are intentionally kept
  on the KV fallback path (see Addendum below). The selector keeps this branch
  in one module.

## Addendum (2026-09-07): Disposition of 300s Window Rate Limits

### Context
Following PR #762, two endpoints remained on the KV rate-limiting path due to
their 300-second window requirements:
- `POST /api/discover` (5 requests / 300 seconds)
- `POST /api/validate/batch` (5 requests / 300 seconds)

The Cloudflare Workers Rate Limiting binding natively supports only 10s and 60s
time windows (`period: 10` or `period: 60`). A decision was required to either:
(a) Rescale to 1 request / 60s using native Rate Limiting bindings; or
(b) Keep KV rate limiting permanently for these two endpoints and document as intentional.

### Decision
Option (b) is selected: **Keep KV rate limiting permanently for `/api/discover` and `/api/validate/batch`**.

### Rationale
1. **Burst Dynamics vs. Pacing**: `/api/discover` (trigger manual discovery) and `/api/validate/batch` (batch validation) are heavy administrative/pipeline operations. Clients occasionally need to trigger 2–3 successive discovery runs or validation batches when debugging or executing complex workflows. Rescaling to 1 request per 60s would eliminate burst capacity and cause poor developer experience (DX).
2. **Negligible Race Risk**: The check-then-set race condition in KV is only impactful under high-concurrency throughput. For low-limit endpoints (5 requests per 5 minutes), concurrent race attempts are extremely rare, and any minor undercount during a race condition carries minimal system impact compared to high-volume user endpoints.
3. **Architectural Simplicity**: Retaining KV fallback logic for 300s windows requires zero runtime schema changes or new bindings, keeping worker configuration minimal while serving custom/extended rate windows cleanly.

## Verification

- Unit tests cover the binding path, the fallback matrix, and unchanged 429
  response shape.
- Existing KV-path tests pass unchanged.
- Sensitive endpoints stay fail-closed on enforcement errors (both paths).
