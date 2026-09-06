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
- Two enforcement paths exist until the 300s endpoints are rethought
  (either accept 60s windows with scaled limits, or keep KV permanently).
  The selector keeps this branch in one module.

## Verification

- Unit tests cover the binding path, the fallback matrix, and unchanged 429
  response shape.
- Existing KV-path tests pass unchanged.
- Sensitive endpoints stay fail-closed on enforcement errors (both paths).
