# PEV Spec — exactOptionalPropertyTypes sweep (issue #768)

## Task

**Title**: Enable exactOptionalPropertyTypes, fix 192 errors
**Author**: opencode + GOAP swarm (5 agents)
**Date**: 2026-09-08
**Priority**: high

## Goal

Enable the final strict flag `exactOptionalPropertyTypes` with zero
runtime behavior change and a green suite.

## Approach

Fix all 192 `tsc --exactOptionalPropertyTypes` errors module by module
on one branch with the flag still off, then flip the flag in one commit.

## Non-Goals

Explicitly state what we are NOT doing:

- [ ] Not touching Cloudflare Workflows migration (issue #763, next wave)
- [ ] Not touching personalized deal alerts (issue #764, next wave)
- [ ] Not rewriting pipeline, auth, or rate-limit logic
- [ ] Not adding dependencies, bindings, or migrations

## Steps

Decompose into the smallest steps that each leave the repo green:

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Agent A: bot/, scripts/, root config, load/integration tests | bot/**, scripts/cli/*, playwright.config.ts | low |
| 2 | Agent B: unit tests only | tests/unit/** | low |
| 3 | Agent C: email, mcp, github, logger, misc lib | worker/email/**, worker/lib/mcp/**, worker/lib/github/*, worker/lib/logger/*, worker/lib/guard-rails.ts, worker/lib/eu-ai-act-logger.ts, worker/lib/errors.ts, worker/lib/error-handler.ts, worker/lib/global-logger.ts, worker/lib/ai-gateway/*, worker/lib/expiration/*, worker/lib/lock.ts, worker/lib/research-agent/compliance-log.ts | medium |
| 4 | Agent D1: storage, webhook, validation, search, nlq, d1, auth lib | worker/lib/referral-storage/*, worker/lib/webhook/*, worker/lib/validation/*, worker/lib/research-agent/** (minus compliance-log.ts), worker/lib/search/*, worker/lib/nlq/**, worker/lib/d1/*, worker/lib/auth.ts | medium |
| 5 | Agent D2: pipeline, routes, worker core | worker/pipeline/*, worker/routes/**, worker/publish.ts, worker/state-machine.ts, worker/validation/**, worker/lib/errors.ts excluded (agent C) | medium |
| 6 | Flip flag to true, full verification | tsconfig.json | low |
| 7 | Quality gate, push, open PR, green CI | — | low |

## Fix patterns (per official TypeScript docs)

1. Target type allows explicit undefined: `reason?: string` becomes
   `reason?: string | undefined` (public boundaries, external payloads).
2. Internal construction sites omit instead of assigning undefined:
   `...(value !== undefined ? { value } : {})` (conditional spread).
3. Tests: omit the key instead of writing `key: undefined`; retype
   `Partial<Env>` fixtures that assign `DEALS_DB: undefined`.

## Agent constraints (merge-conflict safety)

- NEVER edit files outside the assigned scope.
- NEVER edit tsconfig.json (only step 6 does).
- NEVER use `as any` casts or `!` assertions.
- NEVER add unused imports or numeric literals with unclear intent.
- Verify scope with
  `npx tsc --noEmit --exactOptionalPropertyTypes true` filtered to scope,
  plus plain `npx tsc --noEmit`.

## Acceptance Criteria

Concrete, testable statements the Verify phase will check:

- [ ] `npx tsc --noEmit --exactOptionalPropertyTypes true` reports 0 errors
- [ ] `npx tsc --noEmit` passes with flag on
- [ ] `npm run test:unit` passes with zero regressions
- [ ] `./scripts/quality_gate.sh` exits 0
- [ ] `prettier --check` clean on touched files
- [ ] No `as any`, no `!`, no unused imports introduced
- [ ] No file exceeds 500 lines
- [ ] Security scan clean (no SSRF, credential leak, injection)

## Open Questions

- [ ] None. Triage complete: 192 errors, patterns confirmed, scopes disjoint.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Type widening masks missing-value bugs | medium | Prefer conditional spread internally; widen only at boundaries |
| Hot-file edits (referrals.ts, security-adjacent) | medium | Minimal diffs, no logic change, full suite re-run |
| Swarm merge conflicts | low | Disjoint scopes, call-site fixes only |

## Dependencies

- [ ] CI status passing on main (verified 2026-09-07, passing)

## Out of Scope for This Spec

- Issues #763 (Workflows) and #764 (deal alerts): separate Full Mode
  specs in the next waves, sequenced after this flag lands.
