# Swarm Plan: Fix `as any` Casts (P0/P1)

> **Goal**: Replace 5 unsafe `as any` casts with proper types across 3 files

## Tasks

| Task | File | Lines | Current | Fix |
|------|------|-------|---------|-----|
| A | `search.ts` | 89 | `deals as any` | `deals as Deal[]` |
| A | `search.ts` | 90 | `(sort_by \|\| "confidence") as any` | `(sort_by \|\| "confidence") as SortField` |
| A | `search.ts` | 91 | `(order \|\| "desc") as any` | `(order \|\| "desc") as SortOrder` |
| B | `experience.ts` | 44 | `(referral.metadata.experiences as any[])` | `(referral.metadata.experiences as Experience[])` with typed interface |
| C | `report.ts` | 46 | `reason as any` | `reason as string` |

## Execution

1. **Phase 1**: Log handoff ✓
2. **Phase 2 (Parallel)**: Fix all 3 files simultaneously
3. **Phase 3**: Typecheck + code review + commit
4. **Phase 4**: Update state + handoff

## Validation

- `npx tsc --noEmit` must pass
- Code review by deepseek-flash
- Commit with `./scripts/ai-commit.sh`
