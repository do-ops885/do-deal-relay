# ADR-029: Pin Vitest 4 / Zod 3 Until Dedicated Migration Specs (2026-09-07)

**Date**: 2026-09-07
**Status**: Accepted
**Related**: SPEC-ci-unblock-full-hygiene.md, ADR-023, ADR-026
**Branch**: fix/ci-unblock-eresolve-full-hygiene

## Context

On 2026-09-07 origin/main went red on 4 workflows (CI, Security, Labels, Deploy).
All failures share one `npm ci` ERESOLVE:

- `vitest ^5.0.0` + `@vitest/coverage-v8 ^5.0.0` conflict with
  `@cloudflare/vitest-pool-workers 0.22.0` peers `vitest/@vitest/runner/@vitest/snapshot ^4.1.0`.
- Latest pool-workers is still `0.22.0` (2026-08-18). No v5-compatible release exists.
- `zod ^4.5.4` is a second major: 21 files import `zod`, 7x `z.record(single-arg)`
  and 11x `error.errors` sites break under v4.
- `package-lock.json` is in sync; risk is compatibility, not staleness.
- Last green was `76bc23b` (2026-09-07 08:48Z) before merges `#776/#777/#778`.

Secondary findings in same window:

- `beac13e` deleted webhook `validateFetchUrl` hermetic mocks (restored here).
- `worker/lib/rate-limit.ts` at 496/500 (no warning yet, split deferred).
- `check-ci-status.sh --live` only scanned 5 runs for workflow `CI`, missing
  main when dependabot branches dominate; `update-ci-status.sh` reported latest
  run regardless of branch.

## Decision

1. Pin `vitest` + `@vitest/coverage-v8` to `^4.1.11`, `zod` to `^3.22.4`.
   Regenerate lock. Do not adopt vitest 5 until pool-workers ships support.
   Do not adopt zod 4 without a dedicated migration spec.
2. Dependabot: ignore `vitest`, `@vitest/*` majors `>=5` and `zod` majors `>=4`
   until those specs land. Patch/minor automation unchanged.
3. Restore webhook hermetic mocks verbatim from `52603c7` (prettier-formatted).
4. Harden `check-ci-status.sh` and `update-ci-status.sh` to query `headBranch==main`
   across CI, Security, Labels, and Deploy workflows with a larger window.
5. Defer `rate-limit.ts` split and wrangler `namespace_id` provisioning review;
   track as follow-ups. Current 496/500 passes quality gate.

## Consequences

Positive:

- `npm ci` unblocked on all jobs; CI can go green without runtime changes.
- Hermetic unit tests (no live DNS in sandbox).
- Live CI checks stop false-passing on stale cache or dependabot noise.
- Majors cannot silently re-break main.

Negative / accepted:

- Stays on vitest 4 / zod 3 until upstream support + migration spec.
- Dependabot will still open major PRs as ignored (visible but not auto-merged);
  manual migration PRs required later.
- Wrangler placeholder namespace_ids remain owner-verified on deploy.

## Verification

- Clean `npm ci` succeeds.
- `npm run lint`, `npm run test:unit`, `npm run validate`, `npm run build` green.
- `./scripts/quality_gate.sh` exit 0.
- `bash scripts/check-ci-status.sh --live` correctly reflects main after push.
