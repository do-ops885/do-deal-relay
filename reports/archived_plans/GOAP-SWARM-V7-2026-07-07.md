# GOAP Swarm Execution Plan V7 — 2026-07-07

**Generated**: 2026-07-07
**Strategy**: Skills Infrastructure Setup + Remaining Task Verification
**Source**: GOAP_STATE.md, Jules Audit, AGENTS.md skills requirements
**Skills Created**: goap-agent, typescript-coding-standards, pev-loop, validation-gates, pr-resolver, agentic-abstention
**Status**: ✅ COMPLETED

---

## Task Analysis

**Primary Goal**: Build the `.agents/skills/` infrastructure required by AGENTS.md and create supporting scripts
**Secondary Goal**: Verify and close out remaining audit findings
**Constraints**: No breaking changes; maintain existing functionality; follow AGENTS.md conventions

### Issues Addressed

| # | Issue | Source | Resolution |
|:---|:---|:---|:---|
| 1 | Missing `.agents/skills/` directory | AGENTS.md | Created 6 skills with full SKILL.md documentation |
| 2 | Missing `scripts/setup-skills.sh` | AGENTS.md | Created setup script with Claude/Gemini/Qwen symlink support |
| 3 | Missing `.agents/metrics.jsonl` | AGENTS.md | Created with initial entry and format documentation |
| 4 | `author: any` in github/core.ts | Jules Audit | Verified as already resolved (properly typed) |
| 5 | `HACKERNEWS` flagged as TODO | Jules Audit | False positive — valid variable name (HackerNews rate limit) |
| 6 | Deprecated webhooks.ts | Jules Audit | Already removed from codebase |

---

## Execution Plan

**Strategy**: Sequential creation → Parallel verification

```
┌─────────────────────────────────────────────────────────────────┐
│                    GOAP Swarm Controller                        │
│  Strategy: Create Skills → Create Scripts → Verify              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Skills   │    │ Scripts  │    │ Re-Verify│
    │ Create 6 │    │ setup-   │    │ Audit    │
    │ skills   │    │ skills.sh│    │ Findings │
    │ in .agents│   │ metrics  │    │          │
    └──────────┘    └──────────┘    └──────────┘
          │               │               │
          └───────────────┼───────────────┘
                          ▼
              ┌───────────────────────┐
              │  Symlink Creation     │
              │  (Claude/Gemini/Qwen) │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Update GOAP_STATE    │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Typecheck + Format   │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Commit + Push + PR   │
              └───────────────────────┘
```

---

## Skills Created

### 1. goap-agent
- **Path**: `.agents/skills/goap-agent/SKILL.md`
- **Purpose**: Orchestrate swarm-based GOAP execution
- **Workflow**: Analyze → Decompose → Execute (Swarm) → Verify → Synthesize

### 2. typescript-coding-standards
- **Path**: `.agents/skills/typescript-coding-standards/SKILL.md`
- **Purpose**: Enforce TS coding standards, type safety, code quality
- **Rules**: No `as any`, explicit types, strict null checks, 500-line limit

### 3. pev-loop
- **Path**: `.agents/skills/pev-loop/SKILL.md`
- **Purpose**: Plan-Execute-Verify loop implementation
- **Gates**: Format, Typecheck, Lint, Tests, Schema, Security, Dependencies

### 4. validation-gates
- **Path**: `.agents/skills/validation-gates/SKILL.md`
- **Purpose**: Execute and report on 9-gate validation pipeline
- **Gates**: Schema, Trust, Dedupe, Reward, Expiry, Normalization, Idempotency, Second Pass, Snapshot Hash

### 5. pr-resolver
- **Path**: `.agents/skills/pr-resolver/SKILL.md`
- **Purpose**: Automated PR lifecycle: discover → analyze → fix → verify → merge
- **Swarm**: Parallel agents for CI fix, conflict resolution, comments, tests, review

### 6. agentic-abstention
- **Path**: `.agents/skills/agentic-abstention/SKILL.md`
- **Purpose**: Protocol for when agents must abstain due to environmental infeasibility
- **When**: Missing secrets, unavailable services, locked configs, knowledge gaps

---

## Scripts Created

### setup-skills.sh
- **Path**: `scripts/setup-skills.sh`
- **Purpose**: Create symlinks from `.agents/skills/` to `.claude/skills/`, `.gemini/skills/`, `.qwen/skills/`
- **Usage**: `./scripts/setup-skills.sh`

---

## Quality Gates

1. TypeScript compilation (`npx tsc --noEmit`)
2. Prettier formatting (`npx prettier --check`)
3. Markdown lint (`npm run lint:md`)
4. No file exceeds 500 lines (new files)
5. All changes are additive (no removed functionality)

## Acceptance Criteria

- [x] 6 skills created in `.agents/skills/` with SKILL.md
- [x] `scripts/setup-skills.sh` creates symlinks for Claude/Gemini/Qwen
- [x] `.agents/metrics.jsonl` initialized
- [x] Audit findings re-verified
- [x] GOAP_STATE.md updated to v0.6.0
- [x] All quality gates pass
- [x] Changes committed and pushed

---

*GOAP Swarm V7 plan for skills infrastructure setup and audit verification.*
