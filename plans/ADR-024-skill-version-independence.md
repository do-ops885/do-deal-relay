# ADR-024: Skill Version Independence from Product VERSION

**Date**: 2026-08-31
**Status**: Accepted
**Spec**: [SPEC-self-learning-feedback-full.md](SPEC-self-learning-feedback-full.md)
**Context**: `AGENTS.md:15` single source of truth `VERSION` (product, currently 0.1.8) vs `.agents/skills/*/SKILL.md` frontmatter `version:` (skill semver) conflict in `self-learning-feedback` (skill 0.1.6 claims vs product 0.1.8).

## Decision

**Option B — Skill-independent versioning**:

- Product `VERSION` governs product releases and `agents-docs/` / root `*.md` headers only.
- Each skill's `SKILL.md: version:` is independent semantic versioning (skill lifecycle). `evals.json: version:` must track its owning skill's SKILL.md, not product VERSION.
- `verify_version_consistency.sh` gains `--skill-independent` (default for CI) which **excludes** frontmatter checks for paths `\.agents/skills/.*/SKILL\.md` and `.*evals\.json`. Header/badge checks still run on product docs (`agents-docs/**/*.md`, `README.md`, `AGENTS.md` version standards note) against product VERSION.
- Inline example versions (e.g., `0.1.1` in `modules/verify.md` tables) are marked `<!-- illustrative -->` to avoid false positives; alternatively normalized to product VERSION where assertive.

## Alternatives Considered

- **A — Strict sync**: SKILL.md must equal VERSION. Rejected: couples skill iterations to product releases, forces churn on unrelated skills (refcli 1.0.0, cloudflare 1.0.0 etc. would all need bumping).
- **Hybrid — sync only self-learning-feedback**: Rejected: special-casing one skill is inconsistent.

## Consequences

- Patch `scripts/verify_version_consistency.sh` with exclusion list; default `quick_verify.sh` uses `--skill-independent`.
- Rewrite `evals/evals.json` eval `version_matches_project` → `version_is_valid_semver` + `skill_version_consistent` (skill vs evals).
- Update `tests/test_skill.sh: test_version` to semver-valid check, not product equality.
- Document exclusion in `modules/verify.md` severity table.

## Verification

- `bash scripts/verify_version_consistency.sh --skill-independent --report` → 0 fails on product docs
- `bash scripts/verify_version_consistency.sh` (legacy mode) still reports skill mismatches for manual audit (informational)
- `tests/test_skill.sh` green under B semantics

## References

- AGENTS.md:15 — Single Source of Truth
- SKILL.md:4 — skill version 0.1.6
- VERSION — product 0.1.8
