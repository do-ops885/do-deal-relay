# Agent Coordination Hub - do-deal-relay
**Version**: 0.1.8
**Workflow Standard**: Agent Hub v0.2.5 (Adapting Upstream Reference v0.3.5)

## 1. System Constants & Operational Limits
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
- **Single Source of Truth**: Version string maintained exclusively in root `VERSION` file (`0.1.8`). Do not edit version strings elsewhere.

## 2. Analyze-First Mandate & Zero Low-Value Questions
1. **Analyze First**: Prior to asking ANY clarification questions, agents MUST deeply analyze repository structure, local tooling, sub-agents, CI/CD workflows, validation gates, documentation, and conventions.
2. **Zero Low-Value Questions**: Do not ask if quality gates, skills systems, sub-agents, act/local CI rehearsal, or validation scripts exist—they are fully operational.
3. **Infer Patterns**: Infer solutions from existing codebase patterns (Cloudflare Workers, D1 SQLite, KV, Durable Objects, 9-gate pipeline, Centralized Router) before asking questions.
4. **Clarification Threshold**: Ask questions ONLY if information cannot be derived from codebase analysis, multiple valid interpretations exist, or the decision is explicitly organizational/product-oriented.

## 3. Production Reliability & Operational Safeguards
- **SSRF Protection**: Outgoing HTTP calls MUST use `validatedFetch` via `worker/lib/security.ts`. Bypassing DNS/CIDR checks or IPv4-compatible IPv6 validation is strictly forbidden.
- **Validation Pipeline**: Deal submissions MUST pass all 9 validation gates in `worker/validation/pipeline.ts`. Speculative rewrites of validation gates or security controls are forbidden.
- **RBAC Controls**: Admin role required for `/metrics`, `/api/dora-metrics`, `/dora`, `/api/d1/*`. User role required for `/api/nlq` and referral management (Create/Deactivate/Reactivate).
- **Quality Safeguards**: No hardcoded secrets, no magic numbers, no `!` non-null assertions, and no unused imports. Max 500 lines per TypeScript source file.

## 4. Process Modes & PEV Loop (Plan-Execute-Verify)
- **Light Mode** (Small fixes, docs): Run Quality Gate (`./scripts/quality_gate.sh`) -> atomic commit -> PR.
- **Full Mode** (Refactors, systems): Requires spec in `plans/` (`SPEC_TEMPLATE.md`), GOAP tracking in `plans/GOAP_STATE.md`, and ADR creation.
- **CI Precheck**: Before starting Full Mode, verify `.github/ci-status/ci-status.json` is "passing". Pause if failing.
- **Always-Fix Policy**: Implement incrementally. Resolve all pre-existing CI check/lint/type/formatting failures in touched context.
  - *Triage*: If blocked by external factors, register an ADR in `plans/` and mark task as `blocked` in `plans/GOAP_STATE.md`.
- **Incremental Verification**: Re-verify older assumptions before executing GOAP items. Apply progressive verification during tasks.
- **PR Verification Mandate**: Every PR MUST verify all changes end-to-end before merge:
  - All CI checks green (unit, integration, E2E, lint, typecheck, security, quality gates).
  - Local verification: `npm run lint && npm run test:unit` and `./scripts/quality_gate.sh` must pass before `git push`.
  - Address every PR review comment (human or bot) — resolve or reply with fix commit.
  - For Full Mode, sync `plans/` docs, GOAP_STATE version bump, and ADRs in the same PR.
- **Merge Guardrail (NON-NEGOTIABLE)**: NEVER merge a PR with failing CI (`gh pr checks` must show zero failures).

## 5. Operational Commands & Context Hygiene
- Setup & Quality: `./scripts/agent-toolkit.sh setup` | `./scripts/pev-gates.sh` | `./scripts/quality_gate.sh` (13 quality gates)
- Lint & Tests: `npm run lint` | `npm run fmt:fix` | `npm run test:unit`
- Context Control & Sub-Agents: Use specialized sub-agents in `.opencode/agents/` or `.claude/agents/` as context firewalls.
- Skills: Canonical skills live in `.agents/skills/`. Load only as needed via `skill <name>` to optimize token budget.

## 6. PR & Commit Standards (Zero Slop)
- **Zero Slop**: Conversational filler, markdown formatting in commit messages, or emojis are strictly forbidden.
- **PR Descriptions**: Plain-text only, detailing 'What', 'Why', and 'Impact'. Max PR title 150 chars, max body 1000 chars.
- **Commit Format**: MUST be `type(scope): subject` in **strictly lowercase** (e.g., `fix(security): resolve SSRF validation`). Max 72 chars.
- **YAML Workflows**: All new `.github/workflows/*.yml` files must have `# yamllint disable-line rule:truthy` on line 4 (`on:` line).

## 7. Post-Task Protocol
Upon completion or abstention, append a JSON entry to `.agents/metrics/metrics-{agent}.jsonl` (create if missing; fall back to `.agents/metrics.jsonl` if directory absent) to prevent merge conflicts:
- *Completed*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "status": "completed"}`
- *Abstained*: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "abstained": true, "abstention_reason": "code", "stopped_at_step": N}`
