# ADR-030: Migrate to Zod 4 (2026-09-07)

**Date**: 2026-09-07
**Status**: Accepted
**Related**: SPEC-zod-v4-migration.md, ADR-029 (partially superseded for zod only)
**Branch**: fix/zod-v4-migration

## Context

ADR-029 pinned zod to v3 because v4 is a major with known call-site breakage
(21 importing files). The pin served its purpose: main is green. Staying on v3
indefinitely accrues upgrade debt and keeps a dependabot ignore in place, so
the deferred migration is now executed as its own Full Mode spec.

Empirical pre-checks (zod 3.25.76 installed):

- `ZodError.errors` is the identical reference as `ZodError.issues`, so moving
  accessors to `.issues` preserves 400-response `details` shapes byte-for-byte.
- v3-only syntax inventory: 7x single-arg `z.record(v)`, ~10x `.error.errors`,
  plus `datetime()`/`email()`/`url()`/`coerce` sites needing a behavior audit.

## Decision

1. Migrate to zod `^4.5.4`: two-arg `z.record(key, value)`, `.error.issues`
   accessor, behavior audit for string-format schemas.
2. Remove the zod `>=4` dependabot ignore. Keep the vitest `@vitest/* >=5`
   ignores (upstream pool-workers block unchanged).
3. No validation-semantics changes: any suite delta is treated as a regression
   and fixed at the call site, not by loosening schemas, unless v4 documents
   the new behavior as intended (e.g. datetime offsets).

## Consequences

Positive:

- Upgrade debt cleared; dependabot automates future zod minors again.
- Single-arg record ambiguity gone (explicit string keys everywhere).

Negative / accepted:

- Diff touches shared type modules (`worker/types/*`, `worker/email/types.ts`,
  `worker/lib/mcp/schemas.ts`); mitigated by the 2905-test suite plus tsc.
- Vitest 5 pin remains until `@cloudflare/vitest-pool-workers` ships support.

## Verification

- `npm ci` clean, `npx tsc --noEmit` clean, full unit suite green with no
  snapshot updates, `./scripts/quality_gate.sh` exit 0.
