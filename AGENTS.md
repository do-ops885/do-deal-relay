# AGENTS.md - Deal Discovery System (do-deal-relay)

> Single source of truth for all AI coding agents in this repository.
> Supported by: Claude Code, Gemini CLI, OpenCode, Qwen Code, Windsurf, Jules
> See: https://agents.md

## Named Constants

```bash
# Sourced from .agents/config.sh
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_PER_SKILL_MD=250
readonly MAX_LINES_AGENTS_MD=200

# Repository Constraints
readonly TRUST_THRESHOLD_MIN=0.0
readonly TRUST_THRESHOLD_MAX=1.0
readonly GLOBAL_CANDIDATE_BUDGET=1000

# Git/PR configuration
readonly MAX_COMMIT_SUBJECT_LENGTH=72
```

## Development Phases (Agent Workflow)

We use a GOAP (Goal-Oriented Action Planning) approach combined with ADRs (Architecture Decision Records) and TRIZ for structured development.

**Prerequisite**: Always fetch and pull the latest default remote branch before beginning analysis or making changes.

1. **ANALYZE & STRATEGIZE (Phase 1)**
   - **Action**: Use TRIZ-analysis (resolving contradictions) to evaluate the problem and identify architecture requirements. Write an **ADR** (Architecture Decision Record) detailing context, decision, and consequences.
   - **Storage**: Save the ADR in the `plans/` directory.
   - **Gate**: Analyze the repository before asking questions. Infer from existing patterns first.

2. **DECOMPOSE & PLAN (Phase 2)**
   - **Action**: Break down the problem into atomic, testable tasks. Record these in a plan file under `plans/`. Use `plans/GOAP_STATE.md` for active coordination if needed.
   - **Instruction**: Produce a written plan, wait for confirmation for non-trivial tasks.

3. **EXECUTE & COORDINATE (Phase 3)**
   - **Action**: Execute tasks systematically using the atomic commit workflow.
   - **Mandatory**: Run `./scripts/quality_gate.sh` before every commit.
   - **Constraint**: Respect existing 9 validation gates. Avoid speculative rewrites.

4. **SYNTHESIZE (Phase 4)**
   - **Action**: Extract discoveries and update project-specific documentation or `AGENTS.md` contexts. Run `./scripts/analyze-codebase.sh` to update self-learning rules.

## Atomic Commit Workflow (Mandatory)

All agent-driven changes MUST use the helper script:
```bash
./scripts/ai-commit.sh --type <type> [--scope <scope>] --subject <subject> [--body <body>]
```
Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Quality Gate (Required Before Commit)

The system enforces checks via `./scripts/quality_gate.sh`. Fix all errors before pushing.
```bash
./scripts/quality_gate.sh
./scripts/update-docs.sh # Verify and update documentation
```

## Maintenance & Verification

```bash
./scripts/analyze-codebase.sh     # Autonomous analysis and self-learning
./scripts/check-adr-compliance.sh   # Verify ADR registration
./scripts/check-plan-numbering.sh   # Ensure plan counters are consistent
./scripts/archive-stale-plans.sh    # Archive plans older than 60 days
./scripts/self-fix-loop.sh          # Automated quality-fix-retry loop
```

## Validation Gates (Per-Deal Logic)

The system enforces 9 mandatory validation gates in the worker pipeline (`worker/validation/pipeline.ts`):
1. `schema_validation`, 2. `normalization_verification`, 3. `deduplication_check`, 4. `source_trust`, 5. `reward_plausibility`, 6. `expiry_validation`, 7. `second_pass_validation`, 8. `idempotency_check`, 9. `snapshot_hash_verification`.

## Repository Structure Rules

- **Allowed in root**: Only standard config files (package.json, wrangler.jsonc, etc.).
- **Documentation**: MUST be in `docs/` or `agents-docs/`. Use progressive disclosure (keep AGENTS.md concise).
- **Plans/Reports**: MUST be in `plans/` or `reports/`.
- **Skills**: Canonical source is `.agents/skills/`.
- **Temporary Files**: NEVER create temporary files in the root. Use `temp/` or system `/tmp`.

## Branch & PR Coordination

- **Shared Files Protocol**: Frequently modified files require explicit coordination: `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`, `worker/routes/referrals.ts`, `worker/lib/research-agent/fetcher.ts`, `.github/workflows/*.yml`.
- **File Ownership Check**: If any file overlaps between parallel agents, switch to sequential execution.

## Agent Guidance

- **Minimal Clarification**: Do not ask questions that can be answered by analyzing the repo.
- **Context Control**: Use sub-agents as **context firewalls** for discrete tasks (finding implementations, security reviews).
- **Rationalizations & Red Flags**: Every skill must include a `## Rationalizations` table to counter corner-cutting and a `## Red Flags` checklist to identify early warning behaviors.
- **Incremental Changes**: Make small, verified changes. Use read-only tools to confirm effects.

## Lessons Learned

| Date | Issue | Root Cause | Prevention |
|------|-------|-----------|------------|
| 2026-05-20 | PR #324 merge conflicts | Parallel modification of security files | Use Shared Files Protocol |
| 2026-05-20 | Post-merge TS errors | Deleted modules still imported in tests | Run typecheck immediately after merge |

---
## Self-Learning Rules (Auto-Generated)

This section is automatically updated by `./scripts/analyze-codebase.sh`.
