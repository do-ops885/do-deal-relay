# Swarm Plan: Round 4 — Benchmark + CI KV Seeding + v0.1.6 Sprint Plan

## Goal
Execute all 3 suggestions as a coordinated swarm with handoff.

## Tasks

| # | Suggestion | Description |
|---|-----------|-------------|
| A | Run benchmark | `npx tsx scripts/benchmark_pipeline.ts --json reports/benchmark-v0.1.5.json` — ✅ Done (5618 deals/sec) |
| B | CI KV seeding | Add step to `deploy-production.yml` that seeds E2E test API keys to production KV after deploy |
| C | v0.1.6 sprint plan | Write `plans/sprint-v0.1.6.md` with benchmark data and improvement roadmap |

## Execution Strategy

### Phase 1: Parallel Implementation
- Agent B: Edit `.github/workflows/deploy-production.yml` — add "Seed E2E test API keys" step after deploy
- Agent C: Write `plans/sprint-v0.1.6.md` — comprehensive sprint plan with benchmark analysis

### Phase 2: Validation
- TypeScript compilation check
- Code review by deepseek-flash
- Quality gate

### Phase 3: Commit & Handoff
- Commit all changes
- Update coordination state.json + handoff-log.jsonl
- Push to origin/main
