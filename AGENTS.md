# AGENTS.md - Deal Discovery System (do-deal-relay)

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

We use a GOAP (Goal-Oriented Action Planning) approach combined with ADRs (Architecture Decision Records) for structured development.

1. **ANALYZE & STRATEGIZE (Phase 1)**
   - **Action**: Evaluate the problem, identify architecture requirements. Write an **ADR** (Architecture Decision Record) detailing the context, decision, and consequences.
   - **Storage**: Save the ADR in the `plans/` directory.
   - **Instruction**: Analyze the repository before asking questions. Infer from existing patterns first.

2. **DECOMPOSE & PLAN (Phase 2)**
   - **Action**: Break down the problem into atomic, testable tasks. Record these in a plan file under `plans/`.
   - **Instruction**: produce a written plan, wait for confirmation for non-trivial tasks.

3. **EXECUTE & COORDINATE (Phase 3)**
   - **Action**: Execute tasks systematically using the atomic commit workflow.
   - **Mandatory**: Run `./scripts/quality_gate.sh` before every commit.
   - **Instruction**: Respect existing 9 validation gates. Avoid speculative rewrites.

4. **SYNTHESIZE (Phase 4)**
   - **Action**: Extract discoveries and update project-specific documentation or `AGENTS.md` contexts.

## Atomic Commit Workflow (Mandatory)

All agent-driven changes MUST use the helper script:
```bash
./scripts/ai-commit.sh --type <type> [--scope <scope>] --subject <subject> [--body <body>]
```

### Commit Types
`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Quality Gates (System Infrastructure)

The system enforces 13 quality gates via `./scripts/quality_gate.sh`:
1. TypeScript compilation
2. Unit tests
3. Validation gate orchestration check
4. Directory organization
5. Build check
6. Prettier format check
7. YAML syntax validation
8. GitHub Actions workflow validation
9. Secret detection
10. Dependency audit (`npm audit`)
11. Skill symlinks integrity
12. Git hooks installation
13. Dependabot configuration validation

## Validation Gates (Per-Deal Logic)

The system enforces 9 mandatory validation gates in the worker pipeline (`worker/validation/pipeline.ts`):
1. `schema_validation`
2. `normalization_verification`
3. `deduplication_check`
4. `source_trust`
5. `reward_plausibility`
6. `expiry_validation`
7. `second_pass_validation`
8. `idempotency_check`
9. `snapshot_hash_verification`

## Repository Structure Rules

- **Allowed in root**: Only standard config files (package.json, wrangler.jsonc, etc.).
- **Documentation**: MUST be in `docs/` or `agents-docs/`.
- **Plans/Reports**: MUST be in `plans/` or `reports/`.
- **Skills**: Canonical source is `.agents/skills/`.
- **Temporary Files**: MUST be in `temp/`. Diagnostic or transient files (e.g., `typecheck_*.txt`) in the root are forbidden.

## Shared Files Protocol

See skill: `typescript-coding-standards` — hot file coordination rules.

## Lessons Learned

See [`agents-docs/LEARNINGS.md`](agents-docs/LEARNINGS.md). Rule: every correction becomes a rule.

## Skills

Use these canonical skills for common work:
- `typescript-coding-standards` — TS workflow rules, config contracts, endpoint assertion rules
- `jules-usage` — delegation pattern for high-cost work
- `trust-model` — trust threshold and trust scoring guidance
- `validation-gates` — per-deal validation pipeline rules

## Delegation Guidance

- Actions with estimated cost >= 12 should be evaluated for delegation through `jules-usage`.
- Cost rubric is defined in [`agents-docs/hard-constraints.md`](agents-docs/hard-constraints.md).
- Delegated work must be recorded in [`plans/ACTIONS.md`](plans/ACTIONS.md) with `status: delegated`.
- Add `jules_issue: <number>` when delegated.

## Agent Guidance

- **Minimal Clarification**: Do not ask questions that can be answered by analyzing the repo.
- **Architectural Consistency**: Preserve existing state-machine and modular gate architecture.
- **Incremental Changes**: Make small, verified changes.
- **Verification**: Always use read-only tools to confirm the effect of your changes.
