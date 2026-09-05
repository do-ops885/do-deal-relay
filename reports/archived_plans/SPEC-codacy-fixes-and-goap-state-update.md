# PEV Spec — Codacy ShellFix + GOAP_STATE Update

## Task

**Title**: Apply missing Codacy SC2034 shell fixes and update GOAP_STATE to current reality
**Author**: GOAP Agent
**Date**: 2026-07-10
**Priority**: high

## Goal

Cherry-pick the 6 ShellCheck SC2034 variable fixes from `test/split-oversized-tests` onto main, update `plans/GOAP_STATE.md` to reflect that PRs #571, #570, #569 are merged, and ensure all CI gates pass through a clean PR.

## Approach

Apply the 4 shell-script fixes, then update the GOAP_STATE.md PR resolver section and version metadata, run the full PEV verification gate suite, and open a PR to main.

## Non-Goals

- Not adding new features
- Not changing any TypeScript/JS code
- Not modifying CI workflows
- Not addressing blocked/deferred GOAP items (BLOCKED-1, BLOCKED-2, P3-16, P3-17)
- Not syncing `develop` with `main`

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Create branch `chore/codacy-sc2034-and-goap-update` from main | — | low |
| 2 | Apply SC2034 fixes: remove unused vars from 4 shell scripts | `scripts/goap-reverify.sh`, `scripts/harness-audit.sh`, `scripts/pr-resolver.sh`, `scripts/skill-eval-check.sh` | low |
| 3 | Update GOAP_STATE.md: PR resolver status for #571, #570, #569 → MERGED | `plans/GOAP_STATE.md` | low |
| 4 | Update INDEX.md if needed to reflect current state | `plans/INDEX.md` | low |
| 5 | Run PEV gates: format, typecheck, validate, tests | (verification) | low |
| 6 | Commit and push | — | low |
| 7 | Create PR | — | low |

## Acceptance Criteria

- [ ] No ShellCheck SC2034 warnings in `scripts/goap-reverify.sh`, `scripts/harness-audit.sh`, `scripts/pr-resolver.sh`, `scripts/skill-eval-check.sh`
- [ ] GOAP_STATE.md shows PRs #571, #570, #569 as merged
- [ ] `npm run fmt:check` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run validate` passes
- [ ] Markdown lint passes
- [ ] All unit tests pass
- [ ] PR CI shows all green

## Open Questions

- None — all scope clearly bounded

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shell script syntax error | low | Scripts verified with `bash -n` before commit |
| GOAP_STATE merge conflict | low | Will regenerate the section cleanly |

## Dependencies

- [ ] Current `main` branch has no conflicting commits since the shell scripts were last modified

## Out of Scope for This Spec

- P3 deferred items (P3-16, P3-17)
- BLOCKED items (BLOCKED-1, BLOCKED-2)
