# Execution Plan: Evals Final Swarm

## Goal
Execute all 3 followup suggestions from the evals auto-generation work:
1. Merge `feat/jules-usage-evals-live-verify` into `main`
2. Test Guard Rail 10 end-to-end
3. Add CI integration for eval freshness check

## Files to Create/Modify
- `plans/jules-usage-evals-final-swarm.md` — this plan
- `.github/workflows/ci-and-labels.yml` — add eval freshness step to validate-skills job
- `agents-docs/coordination/state.json` — update with completed tasks
- `agents-docs/coordination/handoff-log.jsonl` — log handoff

## Plan

### Phase 1: Setup
- Create plan file
- Log handoff in coordination

### Phase 2: Suggestion 1 — Merge to main
- Create PR from feat/jules-usage-evals-live-verify → main
- Merge PR
- Verify merge was successful

### Phase 3: Suggestion 2 — Test Guard Rail 10
- Backup SKILL.md
- Temporarily modify SKILL.md (add/remove a line)
- Stage the change with git
- Run the pre-commit hook
- Verify Guard Rail 10 warns about stale evals
- Restore SKILL.md from backup

### Phase 4: Suggestion 3 — Add CI integration
- Create a script `scripts/check-evals-freshness.sh` that:
  - Runs generate_evals.py for each skill
  - Diffs against committed evals.json
  - Exits non-zero if stale
- Add a step to `ci-and-labels.yml` in the `validate-skills` job
- Alternatively, add to the `ci.yml` as part of the lint/format stage

### Phase 5: Validation & Commit
- Run all tests (46 expected passes)
- Code review
- Commit with ai-commit.sh
- Final handoff
