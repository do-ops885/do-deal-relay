# Agent Coordination Hub - do-deal-relay

**Workflow Standard**: Agent Hub v0.2.5 (Upstream v0.3.5)
**Product version**: root `VERSION` only. Never restate or edit version numbers in other files (skill-local semver is governed by `plans/ADR-024-skill-version-independence.md`).

## 1. Named Constants & System Limits

| Constant | Value | Enforced by |
| --- | --- | --- |
| `MAX_LINES_PER_SOURCE_FILE` | 500 | fatal (LOC gate) |
| `MAX_LINES_PER_SKILL_MD` | 250 | warning (`skill-eval-check.sh`) |
| `MAX_LINES_AGENTS_MD` | 200 | warning (quality gate) |
| `MAX_COMMIT_SUBJECT_LENGTH` | 72 | commitlint |
| `MAX_PR_TITLE_LENGTH` | 150 | review |
| `MAX_PR_BODY_LENGTH` | 1000 | review |
| `TRUST_THRESHOLD` | 0.3 | gate `source_trust` |
| `DEFAULT_TIMEOUT_SECONDS` | 1800 | agent task budget |

- **Hot files** (coordinate before editing): `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`, `worker/routes/referrals.ts`, `worker/lib/research-agent/fetcher.ts`, `.github/workflows/*.yml`.
- **Single sources of truth**: this file for agent policy, `VERSION` for the product version, `agents-docs/hard-constraints.md` for guard rails and the bypass protocol, `agents-docs/quality-standards.md` for quality criteria. Link to them, never duplicate them.

## 2. Analyze-First Mandate & Zero Low-Value Questions

1. **Analyze first**: inspect repo structure, tooling, sub-agents and workflows before asking anything.
2. **Zero low-value questions**: quality gates, skills, sub-agents and validation scripts exist and work. Do not ask whether they exist.
3. **Infer conventions**: follow existing patterns (centralized middleware router, D1 schema, strict TypeScript, Durable Objects) instead of requesting external guidance.

## 3. Production Reliability & Operational Safeguards

- **SSRF hardening**: all outbound network calls go through `validatedFetch` in `worker/lib/security.ts`. Never bypass DNS/CIDR checks.
- **Validation pipeline**: submissions must pass all 9 gates in `worker/validation/pipeline.ts` (`VALIDATION_GATES` in `worker/config.ts`). Speculative rewrites are forbidden.
- **Canonical MCP tools**: `search_deals` (alias `get_deals`), `get_deal` (alias `get_deal_by_code`), `add_referral` (alias `submit_deal`).
- **RBAC**: `admin` role for `/metrics`, `/api/dora-metrics`, `/dora`, `/api/d1/*`, `/api/status` and feature flags; `user` role for `/api/nlq`, `/api/submit` and referral create/deactivate/reactivate. Enforced by `withAuth` in `worker/router/`.
- **Banned patterns**: hardcoded secrets, magic numbers, non-null `!` assertions, unused imports.

## 4. Skill Routing (load on demand)

Canonical skills live in `.agents/skills/`. `.claude/`, `.gemini/` and `.qwen/` are symlinks to it; OpenCode reads the canonical path. Load only what the task needs (`skill <name>`) to protect the token budget. Full index: `.agents/skills/README.md`.

| Task | Load |
| --- | --- |
| PR, commit, hook or CI work | `pre-commit`, `validation-gates` |
| Planning, decomposition, GOAP | `task-decomposition`, `goap-agent`, `pev-loop` |
| Parallel or delegated work | `parallel-execution`, `agent-coordination`, `multi-agent-orchestration` |
| Worker / Cloudflare surface | `cloudflare`, `durable-objects`, `d1-ops`, `structured-logging` |
| Security-sensitive change | `guard-rails`, `error-sanitization`, `privacy-first`, `crypto-utils` |
| Creating or editing skills | `skill-creator`, `skill-evaluator`, `context-hygiene` |

**Skill hygiene** (sensor: `./scripts/skill-eval-check.sh`): YAML frontmatter with `name` and `description`; `## Rationalizations` is a skill-specific excuse/counter-argument table; `## Red Flags` is a skill-specific checklist; no two skills may share the same Rationalizations/Red Flags block; every relative link in a SKILL.md must resolve; SKILL.md stays under 250 lines.

## 5. Process Modes & PEV Loop (Plan-Execute-Verify)

- **Light Mode** (small fixes, docs, skills): `./scripts/quality_gate.sh` then an atomic commit and a PR.
- **Full Mode** (refactors, systems): spec in `plans/` from `SPEC_TEMPLATE.md`, GOAP tracking in `plans/GOAP_STATE.md`, ADR in `plans/`.
- **CI precheck**: before Full Mode work, confirm `.github/ci-status/ci-status.json` is `passing`; pause if it is not.
- **Always-fix**: resolve lint, type, format and CI failures found in the current context. If a blocker is external, file an ADR and mark the task `blocked` in `plans/GOAP_STATE.md`.
- **Incremental verification**: re-verify earlier assumptions before each GOAP step.


## 6. Verification & Merge Guardrail (non-negotiable)

Local pre-push: `npm run lint && npm run test:unit && ./scripts/quality_gate.sh`.

- Every PR verifies end to end: unit, integration, E2E, lint, typecheck, security and quality gates green. Do not merge with failing or skipped required checks.
- Resolve every review comment (human or bot) with a fix commit or a reply. No unresolved threads at merge.
- If CI fails after push, fix it in the same PR. Never open a follow-up PR to repair CI.
- Full Mode PRs carry the `plans/GOAP_STATE.md` version bump plus ADR/spec updates.
- Required checks: `CI Summary`, `Type Check`, `Format Check`, `Docs Validation`, `Validation Gates`, `Validate Skills`, `Unit Tests`, `E2E Tests`, `Smoke Tests`, `Security Scan`, `Build`, `Quality Gate`, `CodeQL (actions, javascript-typescript)`, `Codacy Static Code Analysis`, `Workers Builds`.
- Any conclusion other than `SUCCESS` blocks merge: `FAILURE`, `ACTION_REQUIRED`, `TIMED_OUT` and `CANCELLED` all block. `SKIPPED` is acceptable only for non-required jobs such as `auto-merge`.
- Verify before merge: `gh pr checks <n>` and `gh pr view <n> --json statusCheckRollup -q '.statusCheckRollup[] | "\(.name): \(.conclusion)"'` must show zero failures. No `--admin` bypass.
- External analysis failures (Codacy, DeepSource, CodeQL), including `ACTION_REQUIRED` or "Not up to standards" with critical/high findings, must be fixed or triaged with a reviewed suppression.
- Branch protection must require the checks above; if it does not, block the merge and file an ADR.

## 7. Operational Commands

- Setup: `./scripts/agent-toolkit.sh setup`
- Quality: `./scripts/quality_gate.sh` (18 checks) | `./scripts/pev-gates.sh` | `./scripts/skill-eval-check.sh`
- Skills: `./scripts/setup-skills.sh` | `./scripts/validate-skills.sh`
- Lint and tests: `npm run lint` | `npm run fmt:fix` | `npm run test:unit` | `npm run test:integration`
- Sub-agents: `.opencode/agents/` and `.claude/agents/` act as context firewalls; registry in `agents-docs/AGENTS_REGISTRY.md`.

## 8. PR & Commit Standards (zero slop)

- No conversational filler, no markdown formatting in commit messages, no emojis.
- Commits: `type(scope): subject`, strictly lowercase, max 72 chars, for example `fix(security): resolve ssrf validation`.
- PRs: plain text covering What, Why and Impact, calling out performance or metrics changes. Title max 150 chars, body max 1000 chars.
- New `.github/workflows/*.yml` files must carry `# yamllint disable-line rule:truthy` on line 4 (the `on:` line).

## 9. Post-Task Protocol

On completion or abstention, append one JSON line to `.agents/metrics/metrics-{agent}.jsonl` (create if missing; fall back to `.agents/metrics.jsonl` when the directory is absent) so concurrent agents never conflict.

- Completed: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "status": "completed"}`
- Abstained: `{"timestamp": "ISO8601", "agent": "name", "task": "desc", "abstained": true, "abstention_reason": "code", "stopped_at_step": N}`
