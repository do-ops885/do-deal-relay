# Agent Coordination Hub - do-deal-relay

**Workflow Standard**: Adapted from Upstream Workflow Reference (`github-template-ai-agents` v0.3.5)
**Product Version**: Single source of truth is root `VERSION` file. Never restate or edit version numbers elsewhere.

## 1. Core Mandate & Behavioral Contract

1. **Analyze First**: Deeply inspect repository structure, existing agent infrastructure (`.agents/`), tooling, sub-agents, quality gates, CI setup, and conventions before asking questions.
2. **Zero Low-Value Questions**: Infrastructure (quality gates, skills, sub-agents, validation scripts, CI rehearsal) exists and works. Never ask if they exist or if incremental changes/quality gates are desired.
3. **Minimize Clarification Requests**: Infer decisions from existing patterns first. Only request clarification if information cannot be derived from code, multiple valid non-technical interpretations exist, or the decision is explicitly organizational/product-oriented.
4. **Architectural & Operational Guardrails**:
   - Preserve `do-deal-relay` architecture: Cloudflare Workers, D1 storage, KV indexes, Durable Objects, and Vectorize.
   - Make small, incremental changes. Avoid speculative rewrites or altering established validation pipeline logic.
   - Maintain production reliability and SSRF hardening (`validatedFetch` in `worker/lib/security.ts`).

## 2. Named Constants & System Limits

| Constant | Value | Enforced By |
| --- | --- | --- |
| `MAX_LINES_PER_SOURCE_FILE` | 500 | LOC gate (`quality_gate.sh`) |
| `MAX_LINES_PER_SKILL_MD` | 250 | `skill-eval-check.sh` |
| `MAX_LINES_AGENTS_MD` | 200 | Quality gate (`quality_gate.sh`) |
| `MAX_COMMIT_SUBJECT_LENGTH` | 72 | commitlint |
| `MAX_PR_TITLE_LENGTH` | 150 | Review |
| `MAX_PR_BODY_LENGTH` | 1000 | Review |
| `TRUST_THRESHOLD` | 0.3 | `source_trust` gate |
| `DEFAULT_TIMEOUT_SECONDS` | 1800 | Agent task budget |

- **Hot Files**: `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`, `worker/routes/referrals.ts`, `worker/lib/research-agent/fetcher.ts`, `.github/workflows/*.yml`.

## 3. Production Safeguards & Canonical Infrastructure

- **SSRF Hardening**: All outbound requests must use `validatedFetch` in `worker/lib/security.ts` to enforce DNS/CIDR validation. Never bypass safety checks.
- **9-Gate Validation Pipeline**: Submissions pass all 9 gates in `worker/validation/pipeline.ts` (`VALIDATION_GATES`). Never weaken or rewrite gates without explicit specification.
- **Canonical MCP Tools**: `search_deals` (alias `get_deals`), `get_deal` (alias `get_deal_by_code`), `add_referral` (alias `submit_deal`).
- **RBAC**: Enforced by `withAuth` in `worker/router/`. `admin` role for `/metrics`, `/api/dora-metrics`, `/dora`, `/api/d1/*`, `/api/status`, feature flags; `user` role for `/api/nlq`, `/api/submit`, deal CRUD.
- **Banned Patterns**: Hardcoded secrets/tokens, magic numbers, non-null `!` assertions, unused imports, `innerHTML` XSS risks.

## 4. Skill Routing (Load On Demand)

Canonical skills reside in `.agents/skills/`. `.claude/`, `.gemini/`, `.qwen/` are symlinks; OpenCode reads the canonical path. Load skills as needed (`skill <name>`) to preserve context.

| Task | Skill |
| --- | --- |
| PR, commit, hook, or CI work | `pr-resolver`, `pre-commit`, `validation-gates` |
| Planning, decomposition, GOAP | `task-decomposition`, `goap-agent`, `pev-loop` |
| Parallel / delegated work | `parallel-execution`, `agent-coordination`, `multi-agent-orchestration` |
| Worker / Cloudflare surface | `cloudflare`, `durable-objects`, `d1-ops`, `structured-logging` |
| Security-sensitive change | `guard-rails`, `error-sanitization`, `privacy-first`, `crypto-utils` |
| Creating / editing skills | `skill-creator`, `skill-evaluator`, `context-hygiene` |

- **Skill Hygiene**: Valid YAML frontmatter; required `## Rationalizations` and `## Red Flags` sections; unique content; valid relative links; max 250 lines per `SKILL.md`.

## 5. Process Modes & PEV Loop (Plan-Execute-Verify)

- **Light Mode** (Small fixes, docs, skills): Plan → Implement → Local verification (`./scripts/quality_gate.sh`) → Atomic commit/PR. Push branch and open/update PR without waiting for explicit prompt.
- **Full Mode** (Refactors, new subsystems, architecture): Plan spec in `plans/` (`SPEC_TEMPLATE.md`), ADR in `plans/`, GOAP tracking in `plans/GOAP_STATE.md`.
- **PEV Loop**: Verify assumptions incrementally before each step. Check CI status (`.github/ci-status/ci-status.json`). Fix regressions introduced in current context immediately.

## 6. Verification & Quality Gates

Run before commit/push: `npm run lint && npm run test:unit && ./scripts/quality_gate.sh`.

- Required CI checks: `CI Summary`, `Type Check`, `Format Check`, `Docs Validation`, `Validation Gates`, `Validate Skills`, `Unit Tests`, `E2E Tests`, `Smoke Tests`, `Security Scan`, `Build`, `Quality Gate`, `CodeQL`, `Codacy Static Code Analysis`, `Workers Builds`.
- All checks must pass (`SUCCESS`). Resolve all review comments before merging. Never use `--admin` bypass.

## 7. Workflow Commands

- Tooling setup: `./scripts/agent-toolkit.sh setup` | `./scripts/bootstrap.sh`
- Quality & Verification: `./scripts/quality_gate.sh` | `./scripts/pev-gates.sh` | `./scripts/skill-eval-check.sh`
- Local CI rehearsal: `./scripts/run_act_local.sh`
- Tests & Lint: `npm run lint` | `npm run fmt:fix` | `npm run test:unit` | `npm run test:integration`

## 8. Commit & PR Conventions

- **Commits**: `type(scope): subject`, lowercase, max 72 chars. No filler/emojis. Example: `fix(security): resolve ssrf validation`.
- **PRs**: Title `type(scope): description` (max 150 chars); plain text body covering What, Why, Impact (max 1000 chars).
- **YAML Workflows**: Line 4 (`on:`) must carry `# yamllint disable-line rule:truthy`.

## 9. Post-Task Telemetry

Upon task completion or abstention, append a JSON record to `.agents/metrics/metrics-{agent}.jsonl` (or `.agents/metrics.jsonl` fallback):
`{"timestamp": "ISO8601", "agent": "name", "task": "desc", "status": "completed"}`
