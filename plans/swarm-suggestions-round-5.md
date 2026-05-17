# Swarm Plan: Round 5 — v0.1.6 P0-P3 Implementation

## Goal
Execute all 3 pending suggestions from v0.1.6 sprint plan as a coordinated swarm.

## Tasks

| # | Task | Description |
|---|------|-------------|
| A | Optimize discover phase | Parallel source fetching, memoized content extraction, pre-cached context windows in discover.ts |
| B | Add CI benchmark step | Add benchmark job to `release.yml` that runs pipeline benchmark and enforces ≥5,000 deals/sec threshold |
| C | Create seed-local-kv.sh | Consolidate setup-auth.sh + seed-kv.sh + E2E keys into a single `scripts/seed-local-kv.sh` with --local and --remote modes |

## Execution Strategy

### Phase 1: Parallel Implementation
- Agent A: Edit `worker/pipeline/discover.ts` — add parallel URL pattern fetches, memoize extractContent, pre-cache context
- Agent B: Edit `.github/workflows/release.yml` — add `run-benchmark` job between validate-version and deploy-production
- Agent C: Write `scripts/seed-local-kv.sh` — consolidated KV seeding with --local and --remote modes

### Phase 2: Validation
- TypeScript compilation (for discover.ts changes)
- Code review by deepseek-flash

### Phase 3: Commit & Handoff
- Commit all changes
- Update coordination state.json + handoff-log.jsonl
- Push to origin/main
