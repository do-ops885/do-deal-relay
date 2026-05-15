# AGENTS.md - Deal Discovery System (do-deal-relay)

> Single source of truth for all AI coding agents in this repository.
> Supported by: Claude Code, Gemini CLI, Qwen Code, Windsurf, Jules.
> See: https://agents.md

## Named Constants

```bash
# File size limits (lines)
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

1. **ANALYZE & STRATEGIZE (Phase 1)**
   - **Action**: Use TRIZ principles to evaluate the problem and identify architecture requirements. Write an **ADR** in `plans/` detailing context, decisions, and consequences.
   - **Instruction**: Analyze the repository before asking questions. Infer from existing patterns first.

2. **DECOMPOSE & PLAN (Phase 2)**
   - **Action**: Break down the problem into atomic, testable tasks. Record these in a plan file under `plans/`.
   - **Instruction**: Produce a written plan; wait for confirmation for non-trivial tasks.

3. **EXECUTE & COORDINATE (Phase 3)**
   - **Action**: Execute tasks systematically using the atomic commit workflow.
   - **Action**: Run `./scripts/quality_gate.sh` before every commit. Fix all errors.
   - **Instruction**: Respect existing 9 validation gates. Avoid speculative rewrites. Maintain operational reliability.

4. **SYNTHESIZE (Phase 4)**
   - **Action**: Extract discoveries and update project-specific documentation or `AGENTS.md` contexts.

## Version Management

**Single source of truth**: `VERSION` file at root. Never edit version strings elsewhere.

## Atomic Commit Workflow (Mandatory)

All agent-driven changes MUST use the helper script:
```bash
./scripts/ai-commit.sh --type <type> [--scope <scope>] --subject <subject> [--body <body>]
```
**Commit Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Quality Gates (System Infrastructure)

The system enforces 12 quality gates via `./scripts/quality_gate.sh`:
1. TypeScript compilation
2. Unit tests
3. Validation gate orchestration
4. Directory organization
5. Build check
6. Prettier format check
7. YAML syntax validation
8. GitHub Actions workflow validation
9. Secret detection
10. Dependency audit
11. Skill symlinks integrity
12. Git hooks installation

## Validation Gates (Per-Deal Logic)

The system enforces 9 mandatory validation gates in `worker/validation/pipeline.ts`:
1. `schema_validation`
2. `normalization_verification`
3. `deduplication_check`
4. `source_trust`
5. `reward_plausibility`
6. `expiry_validation`
7. `second_pass_validation`
8. `idempotency_check`
9. `snapshot_hash_verification`

## Agent Guidance

- **Minimal Clarification**: Do not ask questions that can be answered by analyzing the repo.
- **Architectural Consistency**: Preserve state-machine and modular gate architecture.
- **Incremental Changes**: Make small, verified changes. Do not perform large-scale rewrites.
- **Verification**: Always use read-only tools to confirm the effect of your changes.
- **Operational Reliability**: Prioritize stability and follow established workflow conventions.
- **Rationalizations & Red Flags**: Every skill must include a `## Rationalizations` table to preemptively counter excuses for cutting corners, and a `## Red Flags` checklist. Review these whenever using a skill.

## Repository Structure Rules

- **Allowed in root**: Only standard config files (package.json, wrangler.jsonc, etc.).
- **Documentation**: MUST be in `docs/` or `agents-docs/`.
- **Plans/Reports**: MUST be in `plans/` or `reports/`.
- **Skills**: Canonical source is `.agents/skills/`.
