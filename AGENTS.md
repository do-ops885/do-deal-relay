# Agent Coordination Hub - do-deal-relay

## Named Constants
Essential bounds for the repository.
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

## Development Phases (Agent Workflow)
We use a GOAP approach combined with ADRs for structured development.

1. **ANALYZE & STRATEGIZE (Phase 1)**
   - **Action**: Evaluate the problem, identify architecture requirements. Write an **ADR** in `plans/`.
   - **Instruction**: Analyze the repository before asking questions.

2. **DECOMPOSE & PLAN (Phase 2)**
   - **Action**: Break down the problem into atomic tasks in a plan file under `plans/`.
   - **Instruction**: Produce a written plan, wait for confirmation for non-trivial tasks.

3. **EXECUTE & COORDINATE (Phase 3)**
   - **Action**: Execute tasks using the atomic commit workflow.
   - **Mandatory**: Run `./scripts/quality_gate.sh` before every commit.
   - **Instruction**: Respect existing 9 validation gates.

4. **SYNTHESIZE (Phase 4)**
   - **Action**: Extract discoveries and update project-specific documentation or `agents-docs/LEARNINGS.md`.

## Atomic Commit Workflow (Mandatory)
All agent-driven changes MUST use:
```bash
./scripts/ai-commit.sh --type <type> [--scope <scope>] --subject <subject> [--body <body>]
```
**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Hard Constraints
Mandatory limits and structure rules.
- **File size limits**: ≤ 500 lines for source files.
- **Repository structure**: Strict root directory policy.
- **13 Quality Gates**: Enforced via `./scripts/quality_gate.sh`.
- **9 Validation Gates**: Enforced in `worker/validation/pipeline.ts`.
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

## Reference Docs
- [agents-docs/accuracy-guardrails.md](agents-docs/accuracy-guardrails.md) — Verification rules and CI-safety.
- [agents-docs/self-learning-patterns.md](agents-docs/self-learning-patterns.md) — Compound engineering and learning escalation.
- [agents-docs/LEARNINGS.md](agents-docs/LEARNINGS.md) — Event log of repository lessons.

## Skills
Use these canonical skills for common work:
- `typescript-coding-standards` — Coordination for hot files and config changes.
- `jules-usage` — Delegation pattern for high-cost work (Score ≥ 12).
- `trust-model` — Trust threshold and scoring guidance.
- `validation-gates` — Per-deal validation pipeline rules.

## Lessons Learned
Rule: every correction becomes a rule. See [agents-docs/LEARNINGS.md](agents-docs/LEARNINGS.md).

## Agent Guidance
- **Minimal Clarification**: Do not ask questions that can be answered by analysis.
- **Verification**: Always use read-only tools to confirm effects.
- **Skill-First Workflow**: When a skill is loaded or available in `.agents/skills/`, follow its documented workflows, CLI commands, and output-parsing patterns. Never create throwaway scripts for tasks a skill already covers. If a skill's workflow is insufficient, update the skill itself rather than bypassing it. See [agents-docs/LEARNINGS.md](agents-docs/LEARNINGS.md) (2026-06-04 entries).
- **Fix-Forward**: Always attempt to fix pre-existing issues and warnings encountered during work. If a fix is not possible (e.g., upstream bug, external dependency, out-of-scope), create a follow-up plan in `plans/` documenting the issue and proposed resolution.
