# PEV Spec — F-12 Test `as any` Residue Cleanup

## Task

**Title**: Eliminate remaining test `as any` casts (191 in 82 files)
**Author**: muse-spark
**Date**: 2026-10-06
**Priority**: medium

## Goal

Remove every `as any` cast from `tests/` while preserving test semantics,
closing the F-12 residue tracked in GOAP_STATE v0.19.34.

## Approach

Five-agent swarm with disjoint file clusters, using the established
`tests/fixtures/typed-assert.ts` helpers (`jsonRecord`, `recordArray`,
`firstText`, `firstJson`, `structuredPayload`) plus `vi.mocked` and
`as unknown as` narrowing; test-only changes, zero `worker/` edits.

## Non-Goals

- [ ] Not touching any file under `worker/` (tests + docs + plans only)
- [ ] Not migrating N-3 logging importers (115 files; separate ADR-025 wave)
- [ ] Not cutting F-4 DO phase 2 (ADR-017; needs dedicated care)
- [ ] Not implementing IMP-1/IMP-2/IMP-3 (owner/separate-project scope)
- [ ] Not running owner ops (prod D1 v13/v14, queues create, seeding, creds)

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Cluster A: e2e + browser + smoke + integration specs | tests/e2e/api.spec.ts, tests/browser/*, tests/smoke/endpoints.test.ts, tests/integration/referrals+scheduled+research-api | low |
| 2 | Cluster B: webhook unit suites | tests/unit/webhook/*, tests/unit/webhook-delivery-parallel.test.ts | low |
| 3 | Cluster C: nlq + gates + query-builder suites | tests/unit/nlq/*, tests/unit/gates/*, tests/unit/nlq-utils.test.ts | low |
| 4 | Cluster D: security/auth/middleware/circuit-breaker suites | tests/unit/security-*.test.ts, tests/unit/auth.*.test.ts, tests/unit/jwt-auth.test.ts, tests/unit/middleware/*, tests/unit/circuit-breaker.*.test.ts, tests/unit/ssrf-bypass.test.ts, tests/unit/rate-limit.test.ts | low |
| 5 | Cluster E: remaining unit misc + docs/API.md queue-ops section + alert-consumer-failures suite + #873 triage | tests/unit remaining ~25 files, docs/API.md, tests/unit/queues/alert-consumer-failures.test.ts | low |
| 6 | Register sync: GOAP_STATE v0.19.35 + INDEX + metrics | plans/GOAP_STATE.md, plans/INDEX.md | low |

## Acceptance Criteria

- [ ] `grep -r "as any" tests/` returns zero production-code matches (fixture comment reworded if it matches)
- [ ] Zero `as any` in `worker/` (already 0; must stay 0)
- [ ] `npx tsc --noEmit` clean
- [ ] Targeted vitest suites green per cluster; full `npm run test:unit` green
- [ ] `prettier --check` clean on touched files
- [ ] `./scripts/quality_gate.sh` exit 0 (warnings-only acceptable if pre-existing)
- [ ] Existing tests still pass (no regression; semantics preserved)

## Open Questions

- [ ] None. Pattern proven over two prior waves (MCP + NLQ, then deals-route/config/webhook/integration clusters).

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Narrowing helper throws on unexpected shape | low | Helpers fail loudly with clear message; run targeted suite per file |
| Playwright specs need genuinely-untyped JS interop | low | Prefer `as unknown as <Type>` over `any`; keep runtime identical |
| Merge collision between clusters | low | Disjoint file lists; single branch, sequential staging |

## Dependencies

- [ ] None. No prod code, infra, secrets, or other tracks required.

## Out of Scope for This Spec

- N-3 logging importer migration (ADR-025 deferred menu)
- F-4 DO cutover remainder (ADR-017 phase 2)
- IMP-1 dashboard, IMP-2 OTEL export, IMP-3 build-once
- Owner ops: prod D1 v13/v14 apply, `wrangler queues create`, prod seeding, REDDIT-6/CI-1 credentials

(End of file)
