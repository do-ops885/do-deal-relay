# Agent Coordination Hub - do-deal-relay
**Version**: 1.0.0

## Named Constants
Essential bounds for the repository.
```bash
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_AGENTS_MD=200
readonly MAX_COMMIT_SUBJECT_LENGTH=72
readonly DEFAULT_MAX_RETRIES=3
readonly DEFAULT_TIMEOUT_SECONDS=1800
```
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

## Development Phases
We use a GOAP approach combined with ADRs for structured development.

1. **ANALYZE & STRATEGIZE (Phase 1)**
   - Evaluate problem, identify architecture. Write **ADR** in `plans/`.
   - **Mandatory**: Analyze the repository before asking questions. Minimize clarifications.

2. **DECOMPOSE & PLAN (Phase 2)**
   - Use `goap-agent` or `task-decomposition` skills to break down tasks in `plans/`.

3. **EXECUTE & COORDINATE (Phase 3)**
   - Use atomic commit workflow: `./scripts/ai-commit.sh`.
   - **Mandatory**: Run `./scripts/quality_gate.sh` (13 gates) before every commit.
   - Respect 9 validation gates in `worker/validation/pipeline.ts`.

4. **SYNTHESIZE (Phase 4)**
   - Extract discoveries to `agents-docs/LEARNINGS.md`. Update `AGENTS.md` if needed.

## Atomic Commit Workflow (Mandatory)
```bash
./scripts/ai-commit.sh --type <type> [--scope <scope>] --subject <subject>
```

## Quality & Validation
- **13 Quality Gates**: Enforced via `./scripts/quality_gate.sh` (Tests, Lint, Security, Audit, etc.).
- **9 Validation Gates**: Per-deal logic (Schema, Trust, Dedupe, Plausibility, etc.).
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

## Reference Docs
- [agents-docs/accuracy-guardrails.md](agents-docs/accuracy-guardrails.md) — Verification rules.
- [agents-docs/self-learning-patterns.md](agents-docs/self-learning-patterns.md) — Escalation path.
- [agents-docs/LEARNINGS.md](agents-docs/LEARNINGS.md) — Event log of repository lessons.

## Skills & Guidance
- **Skill-First**: Use canonical skills in `.agents/skills/`:
  - `typescript-coding-standards` — Coordination for hot files and config changes.
  - `jules-usage` — Delegation pattern for high-cost work (Score ≥ 12).
  - `trust-model` — Trust threshold and scoring guidance.
  - `validation-gates` — Per-deal validation pipeline rules.
- **Verification**: Always use read-only tools to confirm effects.
- **Minimal Clarification**: Infer from existing patterns first.
- **Fix-Forward**: Attempt to fix pre-existing issues found during work.

## Post-Task Protocol
After every task, append a JSON entry to `.agents/metrics.jsonl`:
```json
{"timestamp": "<ISO-8601>", "agent": "jules", "task": "<desc>", "status": "completed", "duration_seconds": <int>}
```
