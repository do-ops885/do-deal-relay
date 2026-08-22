# Agent Coordination Hub - do-deal-relay
**Version**: 0.2.4 (Adapted Upstream Workflow Standards v0.3.5)

## 1. Named Constants & System Limits
```bash
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_AGENTS_MD=200
readonly MAX_COMMIT_SUBJECT_LENGTH=72
readonly MAX_PR_TITLE_LENGTH=150
readonly MAX_PR_BODY_LENGTH=1000
readonly TRUST_THRESHOLD=0.3
readonly DEFAULT_TIMEOUT_SECONDS=1800
```
- **Hot Files**: `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`, `worker/routes/referrals.ts`.
- **Single Source of Truth**: System version is maintained solely in the root `VERSION` file. Never edit version strings elsewhere.

## 2. Analyze-First Mandate & Zero Low-Value Questions
1. **Analyze First**: Prior to asking ANY clarification questions, deeply analyze the repository structure, local tooling, sub-agent setups, and workflows.
2. **Zero Low-Value Questions**: Do not ask if quality gates, skills systems, sub-agents, or validation scripts exist—they are fully operational.
3. **Infer Conventions**: Infer solutions from existing codebase patterns (Centralized Middleware Router, SQLite/D1 schema, strict TypeScript, and Cloudflare Durable Objects) before seeking external clarification.

## 3. Production Reliability & Operational Safeguards
- **SSRF Hardening**: Outgoing network calls MUST use `validatedFetch` via `worker/lib/security.ts`. Never bypass DNS/CIDR checks.
- **Validation Pipeline**: Submissions MUST pass all 9 validation gates in `worker/validation/pipeline.ts`. Speculative rewrites are strictly forbidden.
- **RBAC Controls**: Admin role required for `/metrics`, `/api/dora-metrics`, `/dora`, and `/api/d1/*`. User role required for `/api/nlq` and referral management (Create/Deactivate/Reactivate).
- **Banned Patterns**: No hardcoded secrets, no magic numbers, no `!` assertions, and no unused imports. Maintain high operational safety.

## 4. Process Modes & PEV Loop (Plan-Execute-Verify)
- **Light Mode** (Small fixes, docs): Run Quality gate (`./scripts/quality_gate.sh`) → atomic commit → PR.
- **Full Mode** (Refactors, systems): Requires spec in `plans/` (using `SPEC_TEMPLATE.md`), GOAP tracking in `plans/GOAP_STATE.md`, and ADR creation.
- **CI Precheck**: Before starting in Full Mode, verify `.github/ci-status/ci-status.json` is "passing". Pause if failing.
- **Always-Fix Policy**: Implement incrementally. Resolve all pre-existing CI check/lint/type/formatting failures in current context.
  - *Triage*: If an issue is blocked by external factors, register an ADR in `plans/` and set the task as `blocked` in `plans/GOAP_STATE.md`.
- **Incremental Verification**: Re-verify older assumptions before executing GOAP items. Apply progressive verification during tasks.

## 5. Operational Commands & Standards
- Setup & Quality: `./scripts/agent-toolkit.sh setup` | `./scripts/pev-gates.sh` | `./scripts/quality_gate.sh` (13+ quality gates)
- Lint & Tests: `npm run lint` | `npm run fmt:fix` | `npm run test:unit`
- Context Control & Sub-Agents: Use specialized sub-agents in `.opencode/agents/` or `.claude/agents/` as context firewalls.
- Skills: Canonical skills live in `.agents/skills/`. Load only as needed via `skill <name>` to optimize token budget.

## 6. PR & Commit Standards (Zero Slop)
- **Zero Slop**: Conversational filler, markdown formatting in commit messages, or emojis are strictly forbidden.
- **PR Descriptions**: Plain-text only, detailing 'What', 'Why', and 'Impact' (highlighting performance or metrics changes). Max PR title 150 chars, max body 1000 chars.
- **Commit Format**: MUST be `type(scope): subject` in **strictly lowercase** (e.g., `fix(security): resolve SSRF validation`). Max 72 chars.
- **YAML Workflows**: All new `.github/workflows/*.yml` files must have `# yamllint disable-line rule:truthy` on line 4 (`on:` line).

## 7. Post-Task Protocol
Upon completion or abstention, append a JSON entry to `.agents/metrics/metrics-{agent}.jsonl` (create if missing; fall back to `.agents/metrics.jsonl` if directory absent) to prevent merge conflicts:
- *Completed*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "status": "completed"}`
- *Abstained*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "abstained": true, "abstention_reason": "code", "stopped_at_step": N}`
