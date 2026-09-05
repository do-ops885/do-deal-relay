# ADR-026: CI Blocked by npm Registry Degradation (2026-09-04)

**Status**: Active (blocking all merges)
**Created**: 2026-09-04
**Decision Maker**: do-deal-relay Platform Team
**Type**: External blocker

---

## Context

During the 2026-09-04 PR triage sweep (PRs 746-750), every CI run on every
branch failed or was cancelled, including `main` itself. Main-branch CI has
been red since 2026-09-03 09:35 UTC with no green run since.

Evidence (all conclusions verified via `gh pr checks` and `gh run list`):

- `main` CI runs `33739682005`, `33742612049`, `33748103597`, `33748677587`,
  `33792387022` (2026-09-03): `failure`; `33847175182` (2026-09-04): `cancelled`.
- PR 748 CI runs `33840255413`, `33850885860`, `33851782991`: `cancelled`.
- PR 749 CI runs `33848255995`, `33850890245`, `33851877151`: `cancelled`.
- PR 750 CI runs `33851130677` (`cancelled`), `33851971705` (`failure`).

Job-level root causes observed in runner logs:

1. `Run npm ci` exceeds the 5-minute `timeout-minutes` budget in
   `.github/workflows/ci.yml` (Type Check job) and is killed mid-install.
2. PR 750 Format Check job log shows `npm error code ECONNRESET`, `syscall
   read`, `errno -104` from the npm registry, exiting 152. This is runner
   network degradation, not a code or format defect (the same tree passes
   `npm run lint`, `npx tsc --noEmit`, `prettier --check`, full unit suite
   2761/2761, and `./scripts/quality_gate.sh` locally).
3. Killed jobs cascade: dependents report `CANCELLED`/`SKIPPED`, which the
   merge guardrail treats as blocking (correctly).

## Decision

1. No merges until CI is green. The merge guardrail (AGENTS.md section 4,
   NON-NEGOTIABLE) holds: `CANCELLED`/`FAILURE` on required checks blocks
   merge, with no admin bypass.
2. Do not re-trigger in a tight loop. Three retrigger rounds (fresh pushes
   plus close/reopen cycles) reproduced identical infra failures; further
   retries only add runner load.
3. Local verification substitutes as merge-readiness evidence in the
   meantime: `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`,
   `./scripts/quality_gate.sh` are green for PRs 748, 749, and 750.
4. Retry CI once the registry recovers (single close/reopen per PR, or a
   no-op sync push), then merge in order 748, 749, 750 after rebase on the
   then-latest `main`.

## Remediation paths (owner action)

- Consider raising `timeout-minutes` on install-heavy jobs and adding npm
  fetch retries (`fetch-retries`, `fetch-retry-mintimeout`) to
  `.github/workflows/ci.yml`. Note: pushing workflow changes requires a
  token with `workflow` scope, which the current automation token lacks
  (see ADR-019). This is an owner-side change.
- Track npm registry status externally before the next retry round.

## Related

- ADR-019 (deploy timeout too low, workflow-scope blocker)
- agents-docs/KNOWN_ISSUES.md (GitHub Actions resource limits)
- PRs 748, 749, 750 (code-complete, CI-blocked)
