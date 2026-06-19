# Swarm: Check All Evals + Quality Gate + Commit

## Goal
Execute all 3 followup suggestions as a coordinated swarm:
1. Check evals freshness for all skills
2. Run quality gate (all 13 gates)
3. Commit all pending changes

## Strategy: Hybrid (Parallel + Sequential)

### Phase 1: Parallel Checks (independent)
- **Agent A**: Run `bash scripts/check-evals-freshness.sh` — check all skills have fresh evals
- **Agent B**: Run `bash scripts/quality_gate.sh` — run all 13 quality gates

### Phase 2: Sequential Commit (depends on both passing)
- If both checks pass, commit with `./scripts/ai-commit.sh`
- Update coordination state

## Files to Commit
- `.agents/skills/jules-usage/evals/evals.json` — regenerated evals
- `agents-docs/coordination/handoff-log.jsonl` — handoff entry
- `worker/lib/metrics/stats.ts` — as any fixes
- `plans/swarm-stats-fix-and-quality-gate.md` — plan file
- `plans/swarm-freshness-quality-commit.md` — this plan
