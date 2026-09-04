# Agent Coordination Hub - do-deal-relay
**Version**: 0.2.5 (Adapted Upstream Workflow Standards v0.3.5)

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
1. **Analyze First**: Prior to asking ANY clarification questions, deeply analyze the repository structure, existing agent infrastructure (`.agents/`, `agents-docs/`), tooling (`scripts/`), sub-agents (`.claude/agents/`, `.opencode/agents/`), skills (`.agents/skills/`), CI/CD workflows (`.github/workflows/`), and codebase conventions.
2. **Zero Low-Value Questions**: Do NOT ask if quality gates, skills, sub-agents, validation scripts, or local CI rehearsal (`run_act_local.sh`) exist—they are fully operational.
3. **Infer Patterns & Architectural Consistency**: Infer solutions from existing codebase patterns (Centralized Middleware Router, SQLite/D1 schema, Cloudflare Durable Objects, strict TypeScript) before seeking external clarification.
4. **Clarification Threshold**: Only ask questions if information cannot be derived from code, multiple valid interpretations exist, or the decision is explicitly organizational/product-oriented.

## 3. Production Reliability & Operational Safeguards
- **SSRF Hardening**: Outgoing network calls MUST use `validatedFetch` via `worker/lib/security.ts`. Never bypass DNS/CIDR checks or introduce unvalidated fetch calls.
- **9-Gate Validation Pipeline**: Submissions MUST pass all 9 validation gates in `worker/validation/pipeline.ts`. Speculative rewrites are strictly forbidden.
- **RBAC Controls**: Admin role required for `/metrics`, `/api/dora-metrics`, `/dora`, and `/api/d1/*`. User role required for `/api/nlq` and referral management (Create/Deactivate/Reactivate).
- **Banned Patterns**: No hardcoded secrets, no magic numbers, no `!` non-null assertions, and no unused imports. Maintain strict operational safety.
- **Temporary File Discipline**: Create temporary test/debug files ONLY in `/tmp`. Never leave untracked files or scripts in the repository root.

## 4. Process Modes & PEV Loop (Plan-Execute-Verify)
- **Light Mode** (Small fixes, docs, single-skill work): Run Quality gate (`./scripts/quality_gate.sh`) → atomic commit → PR.
- **Full Mode** (Refactors, system architecture, multi-file changes):
  - Check CI Status: Verify `.github/ci-status/ci-status.json` is "passing" before starting. Pause if failing.
  - Requires spec in `plans/` (using `SPEC_TEMPLATE.md`), GOAP tracking in `plans/GOAP_STATE.md`, and ADR registration.
- **Always-Fix & Incremental Verification**: Implement changes incrementally. Resolve all pre-existing CI check/lint/type/formatting failures in touched scope. If blocked externally, register an ADR in `plans/` and set status to `blocked` in `plans/GOAP_STATE.md`.
- **Merge Guardrail (NON-NEGOTIABLE)**: NEVER merge a PR with failing CI. All 13+ status rollup checks (Type Check, Format Check, Docs Validation, Validation Gates, Unit Tests, E2E Tests, Security Scan, Quality Gate) MUST pass before merge.

## 5. Operational Commands & Setup
- One-Command Setup & Doctor: `./scripts/bootstrap.sh` | `./scripts/doctor.sh`
- Unified Toolkit & Quality Gates: `./scripts/agent-toolkit.sh setup` | `./scripts/pev-gates.sh` | `./scripts/quality_gate.sh`
- Lint & Testing: `npm run lint` | `npm run fmt:fix` | `npm run test:unit`
- Local CI Rehearsal: `./scripts/run_act_local.sh` (opt-in local action runner)
- Context Firewalls & Sub-Agents: Utilize specialized sub-agents in `.opencode/agents/` or `.claude/agents/` as context firewalls.
- Skills System: Canonical skills live in `.agents/skills/`. Load skills as needed via `skill <name>`. Review `Rationalizations` and `Red Flags` before executing.

## 6. PR & Commit Standards (Zero Slop)
- **Zero Slop**: Conversational filler, markdown formatting in commit messages, or emojis are strictly forbidden.
- **Commit Format**: MUST be `type(scope): subject` in **strictly lowercase** (e.g., `fix(security): resolve SSRF validation`). Subject max 72 chars.
- **PR Descriptions**: Plain-text only, detailing 'What', 'Why', and 'Impact'. Title max 150 chars, body max 1000 chars.
- **YAML Workflows**: All `.github/workflows/*.yml` files MUST include `# yamllint disable-line rule:truthy` on line 4 (`on:` line). Strict yamllint rules apply (indentation: 2 spaces, max line length: 120).

## 7. Post-Task Protocol & Metrics
Upon task completion or abstention, append a JSON entry to `.agents/metrics/metrics-{agent}.jsonl` (create if missing; fall back to `.agents/metrics.jsonl`) to prevent merge conflicts:
- *Completed*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "status": "completed"}`
- *Abstained*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "abstained": true, "abstention_reason": "code", "stopped_at_step": N}`
