# Swarm Plan: Round 6 — dedupe + validate optimization + release health check

## Goal
Execute all 3 pending suggestions from the v0.1.6 sprint plan as a coordinated swarm.

## Tasks

| # | Task | Description |
|---|------|-------------|
| A | Optimize dedupe phase (16.9%) | Pre-compute keys, Map-based O(1) index lookup, cache URL key pre-computation across passes |
| B | Optimize validate phase (14.0%) | Batch independent synchronous gates into parallel call within each deal |
| C | Add E2E health check to release.yml | Add verify-deployment job between run-benchmark and deploy-production |

## Execution Strategy

### Phase 1: Parallel Implementation
- Agent A: Edit `worker/pipeline/dedupe.ts` — pre-compute partition/cross-source keys, Map-based index lookups
- Agent B: Edit `worker/validation/pipeline.ts` — batch independent sync gates with Promise.all
- Agent C: Edit `.github/workflows/release.yml` — add verify-deployment job

### Phase 2: Validation
- TypeScript compilation
- Code review by deepseek-flash

### Phase 3: Commit & Handoff
- Commit all changes
- Update coordination state.json + handoff-log.jsonl
- Push to origin/main
