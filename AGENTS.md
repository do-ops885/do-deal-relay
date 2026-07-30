# Agent Coordination Hub - do-deal-relay
**Version**: 0.1.9 (Adapted v0.3.5 Upstream Workflow Standards)

## Core Constraints & Hot Files
```bash
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_AGENTS_MD=200
readonly MAX_COMMIT_SUBJECT_LENGTH=72
readonly TRUST_THRESHOLD=0.3
readonly DEFAULT_TIMEOUT_SECONDS=1800
```
- **Hot Files (require coordination)**: `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`, `worker/routes/referrals.ts`, `.github/workflows/*.yml`.
- **SSRF Hardening**: Outgoing calls MUST use `validatedFetch` via `worker/lib/security.ts`. Never bypass SSRF DNS checks.
- **Banned Patterns**: No hardcoded secrets (use `process.env.X`), no magic numbers (use named constants), no `!` (non-null assertions), and no unused imports.
- **Formatting Mandate**: All TypeScript, JavaScript, JSON, YAML, and Markdown files MUST pass `npx prettier --check` before commit. Run `npx prettier --write .` after every file edit. The pre-commit hook BLOCKS unformatted commits (Gate 6). CI Format Check mirrors this gate — formatting failures in CI indicate the agent skipped verification.

## Analyze-First Mandate
1. **Deep Analysis First**: Always analyze the repository and existing infrastructure deeply before asking ANY clarification questions.
2. **Zero Low-Value Questions**: Do not ask whether quality gates, skills systems, sub-agents, or validation scripts exist—they are fully operational and documented.
3. **Infer Patterns Autonomously**: When modifying or adding logic, match existing conventions (Centralized Middleware, TypeScript strict checks) instead of introducing generic templates.

## PEV Loop (Plan-Execute-Verify)
Non-trivial tasks follow the strict PEV loop:
1. **Plan**: Produce a spec with `approach`, `non_goals`, and `acceptance_criteria` in `plans/` using `plans/SPEC_TEMPLATE.md`.
2. **Execute**: Implement incrementally. Apply the **Always-Fix Policy**: fix pre-existing CI check/lint/type/formatting failures in your current context.
   - *Triage Protocol for Unfixable Issues*: Create an ADR in `plans/` documenting the root cause, mark the task as `blocked` in `plans/GOAP_STATE.md`, and link the ADR.
3. **Verify**: After EVERY code change, run `npm run lint` (which runs `tsc --noEmit && prettier --check .`). Never skip this step. Use `./scripts/pev-gates.sh` and the 13 Quality Gates (`./scripts/quality_gate.sh`).
4. **Validation Pipeline**: Deals MUST pass the 9 validation gates in `worker/validation/pipeline.ts`. Speculative rewrites, bypasses, or structural alterations of validation gates are strictly forbidden.

## Operational Commands Quick Reference
- Setup & Doctor: `./scripts/agent-toolkit.sh setup` / `./scripts/agent-toolkit.sh doctor`
- Quality & Verification: `./scripts/pev-gates.sh` / `./scripts/agent-toolkit.sh quality`
- Unit Tests: `npm run test:unit`
- Lint & Format: `npm run lint` / `npm run fmt:fix`

## Session, Context & Swarm Protocols
- **Session Bootstrap**: Compact context is auto-injected at startup via `./hooks/session-start.sh` and `docflow.json`.
- **Cross-Repo Context**: Check `.agents/context/` (e.g., `external-repos.json`, `shared-conventions.md`) if available to synchronize practices with related repositories. Merge precedence: Local instructions > imported context.
- **Re-Verification Protocol**: Before executing GOAP items, verify older deferrals or assumptions in `plans/GOAP_STATE.md` to ensure they are still valid.
- **Incremental Verification**: Post-swarm or mid-development, run targeted verification (typecheck only changed files, run tests in changed directories, format changed files only). Run the full suite only before submission.
- **Skills System**: Maintained in `.agents/skills/`. Claude/Qwen/Gemini use symlinks in `.<tool>/skills/` created via `./scripts/setup-skills.sh`.

## PR & Commit Standards (Zero Slop)
- **Zero Slop**: Conversational filler, markdown in commits, or emojis are strictly forbidden.
- **PR Descriptions**: Plain-text format only, specifying 'What', 'Why', and 'Impact' (specifying metrics/performance changes).
- **Commit Format**: MUST be `type(scope): subject` in **strictly lowercase** (e.g., `fix(security): resolve SSRF validation`). Subject line length limit: 72 characters. PR Title limit: 150 characters.

## Post-Task Protocol
Append JSON entry to `.agents/metrics.jsonl` upon completion or abstention:
- *Completed*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "status": "completed"}`
- *Abstained*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "abstained": true, "abstention_reason": "code", "stopped_at_step": N}`
