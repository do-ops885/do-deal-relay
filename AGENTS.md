# Agent Coordination Hub - do-deal-relay
**Version**: 0.2.0 (Adapted v0.3.5 Upstream Workflow Standards)

## Core Constants & Hot Files
```bash
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_AGENTS_MD=200
readonly MAX_COMMIT_SUBJECT_LENGTH=72
readonly MAX_PR_TITLE_LENGTH=150
readonly MAX_PR_BODY_LENGTH=1000
readonly TRUST_THRESHOLD=0.3
readonly DEFAULT_TIMEOUT_SECONDS=1800
```
- **Hot Files**: `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`, `worker/routes/referrals.ts`, `.github/workflows/*.yml`.
- **SSRF Hardening**: Outgoing network calls MUST use `validatedFetch` via `worker/lib/security.ts`. Never bypass DoH/DNS checks.
- **Banned Patterns**: No hardcoded secrets, no magic numbers, no `!` assertions, and no unused imports.
- **Single Source of Truth**: System version is maintained solely in the root `VERSION` file. Never edit version strings elsewhere.

## Analyze-First Mandate
1. **Deep Analysis First**: Prior to asking ANY clarification questions, deeply analyze the repository, local tooling, and workflows.
2. **Zero Low-Value Questions**: Do not ask if quality gates, skills systems, sub-agents, or validation scripts exist—they are fully operational.
3. **Infer Conventions**: Align with existing patterns (Centralized Middleware, TypeScript strict checks) instead of generic template styles.

## Development Modes & PEV Loop (Plan-Execute-Verify)
- **Light Mode** (Small fixes, docs): Quality gate → atomic commit → PR.
- **Full Mode** (Refactors, systems): Requires spec in `plans/` (using `SPEC_TEMPLATE.md`), GOAP tracking, and ADR creation.
- **CI Precheck**: Before starting in Full Mode, verify `.github/ci-status/ci-status.json` is "passing". Pause if failing.
- **Execution & Always-Fix Policy**: Implement incrementally. Resolve all pre-existing CI check/lint/type/formatting failures in current context.
  - *Triage Protocol*: If an issue is blocked by external factors, register an ADR in `plans/` and set the task as `blocked` in `plans/GOAP_STATE.md`.
- **Validation Pipeline**: Deals MUST pass the 9 validation gates in `worker/validation/pipeline.ts`. Speculative rewrites or gate bypasses are strictly banned.

## Operational Commands & Standards
- Setup & Quality: `./scripts/agent-toolkit.sh setup` | `./scripts/pev-gates.sh` | `./scripts/quality_gate.sh` (13 quality gates)
- Lint & Tests: `npm run lint` | `npm run fmt:fix` | `npm run test:unit`
- Context Control & Sub-Agents: Use specialized agents in `.opencode/agents/` or `.claude/agents/` as context firewalls to isolate intermediate steps.
- Skills: Canonical skills live in `.agents/skills/`. Load only as needed via `skill <name>` to optimize token budget.
- Re-Verification: Before executing GOAP items, re-verify older assumptions or deferrals. Apply incremental verification during tasks.

## PR & Commit Standards (Zero Slop)
- **Zero Slop**: Conversational filler, markdown in commit messages, or emojis are strictly forbidden.
- **PR Descriptions**: Plain-text only, detailing 'What', 'Why', and 'Impact' (highlighting performance or metrics changes).
- **Commit format**: MUST be `type(scope): subject` in **strictly lowercase** (e.g., `fix(security): resolve SSRF validation`). Max 72 chars.
- **YAML Workflows**: All new `.github/workflows/*.yml` files must have `# yamllint disable-line rule:truthy` on the `on:` line (typically line 4).

## Post-Task Protocol
Upon completion or abstention, append a JSON entry to `.agents/metrics/metrics-{agent}.jsonl` (create if missing; fall back to `.agents/metrics.jsonl` if directory absent) to prevent merge conflicts:
- *Completed*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "status": "completed"}`
- *Abstained*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "abstained": true, "abstention_reason": "code", "stopped_at_step": N}`
