# PEV Spec — Self-Learning-Feedback Full Verifier Suite (Skill-Independent Version Policy)

## Task

**Title**: Implement full self-learning-feedback verifier suite with skill-independent version policy
**Author**: opencode/muse-spark
**Date**: 2026-08-31
**Priority**: high

## Goal

Make `.agents/skills/self-learning-feedback` pass its own ANALYSIS SWARM (RYAN/FLASH/SOCRATES/SYNTHESIS) gates end-to-end: version policy B (skill semver independent from product VERSION), 11 scripts wired, evals ≥85, `test_skill.sh` green, and `quick_verify.sh` green.

## Approach

Patch policy first (ADR-024 + evals/test), then implement missing RYAN/FLASH/SYNTHESIS scripts incrementally behind `GOAP_STATE.md` tracking; verify with `quick_verify.sh` + `score_batch.sh` + `quality_gate.sh` before PR.

## Non-Goals

- [ ] Not touching product VERSION (0.1.8) or unrelated skills' versions (refcli 1.x etc.) <!-- illustrative -->
- [ ] Not rewriting existing 3 scripts beyond B-flag patch
- [ ] Not adding track_trends / question_assumptions / test_confidence beyond deferred stubs
- [ ] Not changing AGENTS.md workflow standards scope

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | ADR-024: skill version independence decision | `plans/ADR-024-*.md`, `plans/GOAP_STATE.md` | low |
| 2 | Rewrite evals + test_skill.sh for B semantics | `.agents/skills/self-learning-feedback/evals/evals.json`, `tests/test_skill.sh` | low |
| 3 | Patch verify_version_consistency.sh with --skill-independent flag | `scripts/verify_version_consistency.sh` | medium |
| 4 | Implement quick_verify.sh + verify_file.sh wrappers | `scripts/quick_verify.sh`, `scripts/verify_file.sh` | low |
| 5 | Implement RYAN verifiers (4 scripts) | `scripts/verify_status_accuracy.sh`, `verify_todo_alignment.sh`, `verify_cross_references.sh`, `verify_typo_misleading.sh` | medium |
| 6 | Implement FLASH scorers (score_output, score_batch) | `scripts/score_output.sh`, `scripts/score_batch.sh` | low |
| 7 | Implement SYNTHESIS improve (suggest_fixes, auto_correct, report_issues) + fix capture_lesson dual path | `scripts/suggest_fixes.sh`, `auto_correct.sh`, `report_issues.sh`, `capture_lesson.sh`, `modules/learn.md` refs | medium |
| 8 | Update modules docs examples + cross-refs | `modules/verify.md`, `modules/score.md`, `modules/improve.md`, `SKILL.md` refs | low |
| 9 | Full verification: quick_verify + score_batch + quality_gate + GOAP bump | `plans/GOAP_STATE.md`, `agents-docs/LESSONS.md`, `references/lessons.jsonl` | low |

## Acceptance Criteria

- [ ] `bash .agents/skills/self-learning-feedback/scripts/verify_version_consistency.sh --skill-independent --report` exits 0, fail=0
- [ ] `bash .agents/skills/self-learning-feedback/scripts/quick_verify.sh` exits 0
- [ ] `bash .agents/skills/self-learning-feedback/tests/test_skill.sh` exits 0 (8/8 green)
- [ ] `bash .agents/skills/self-learning-feedback/evals/evals.json` valid JSON, 7 evals, weighted ≥85
- [ ] `bash .agents/skills/self-learning-feedback/scripts/score_batch.sh .agents/skills/self-learning-feedback --json` overall ≥80 for skill docs
- [ ] 11 scripts exist, each <500 lines, each executable, each has --help
- [ ] 2 lessons captured (version policy + missing scripts) in JSONL + LESSONS.md dual format
- [ ] No lint/type errors introduced (npm run lint, tsc --noEmit)
- [ ] All 9 validation gates conceptual coverage (version, status, todo, cross-ref, typo, noise, accuracy, completeness, clarity) exercised by suite
- [ ] Existing tests still pass (no regression)

## Open Questions

- [x] Q1 Version policy: B (skill-independent) — decided by user 2026-08-31
- [x] Q2 Scope: Full (11 scripts) — decided
- [x] Q3 Mode: Full (SPEC+GOAP+ADR) — decided

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Exclusive path regex misses edge skill paths | medium | Use `\.agents/skills/|agents-docs/` exclusion list, test on repo grep |
| Example versions 0.1.1 flagged as failures | medium | Mark examples as illustrative (`<!-- illustrative -->`) or normalize to current product VERSION in docs |
| New scripts exceed 500-line limit | low | Keep each <150 lines; shell only, no embedded large heredocs |
| GOAP_STATE merge conflict with concurrent bumps | low | Bump min patch (0.19.0→0.19.1), single commit |

## Dependencies

- [ ] `.github/ci-status/ci-status.json` passing — verified 2026-08-31 passing
- [ ] `plans/SPEC_TEMPLATE.md` exists — yes

## Out of Scope for This Spec

- track_trends / question_assumptions / test_confidence full implementations — deferred to follow-up ADR
- Product VERSION bump workflow — out of scope
- CI gate wiring for skill (follow-up PR)
