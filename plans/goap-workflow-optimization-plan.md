# GOAP Plan: Workflow Audit and Optimization (2026)

## Goal
Analyze all GitHub workflows, fix correctness issues, and apply pragmatic 2026 best-practice optimizations.

## World State
- Workflows exist across CI, deploy, release, security, rollback, canary, maintenance.
- One confirmed invalid expression in `security.yml`.
- Existing `yaml-lint.yml` already includes `actionlint` for syntax validation.

## Actions
1. **Analyze**: Inspect all workflow files for correctness and security gaps.
2. **Decompose**: Separate must-fix runtime issues from safe optimizations.
3. **Strategize**: Apply low-risk improvements that preserve current behavior.
4. **Execute**: Patch workflows and document decisions in ADR.
5. **Validate**: Run repo quality gate + workflow lint checks.

## Quality Gates
- Workflows parse and lint via `actionlint`/repo checks.
- `./scripts/quality_gate.sh` passes before commit.
- Changes are atomic and documented.

## Outcome
- Runtime issue fixed.
- Security workflow hardened and made more efficient.
- Planning artifacts added under `plans/` with GOAP + ADR traceability.
