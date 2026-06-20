# Agent Coordination Hub - do-deal-relay
**Version**: 0.1.8

## Core Constraints
```bash
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_AGENTS_MD=200
readonly MAX_COMMIT_SUBJECT_LENGTH=72
readonly TRUST_THRESHOLD=0.3
readonly DEFAULT_TIMEOUT_SECONDS=1800
```
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

## Development Phases
We use a Goal-Oriented Action Planning (GOAP) approach combined with Architectural Decision Records (ADRs) and TRIZ for structured development.

1. **ANALYZE & STRATEGIZE (Phase 1)**
   - **Deep Analysis**: Analyze repo structure and existing infrastructure deeply before asking questions.
   - **TRIZ/ADR**: Use TRIZ-based analysis for complex deal-discovery logic. Write an ADR in `plans/`.
   - **CI Status**: Check CI status via `./scripts/check-ci-status.sh`. If not passing, "Always-Fix" protocol applies.

2. **DECOMPOSE & PLAN (Phase 2)**
   - **Deep Planning Mode**: Enter Deep Planning Mode at start. Interaction required to confirm assumptions.
   - **GOAP**: Break into atomic tasks in `plans/GOAP_STATE.md`.

3. **EXECUTE & COORDINATE (Phase 3)**
   - **Atomic commits**: Execute tasks systematically with atomic commits.
   - **Always-Fix Pre-Existing Issues**: Agents MUST fix any existing CI check, lint warning, or quality-gate finding found in the current context as part of the task. Zero tolerance for regressive or inherited failures.
   - **Quality Gate**: Run `./scripts/quality_gate.sh` after every change.

4. **SYNTHESIZE (Phase 4)**
   - **Documentation**: Update `README.md`, `docs/`, and `agents-docs/`.
   - **Extract learnings**: Append discoveries to `agents-docs/LEARNINGS.md` or nearest `AGENTS.md`.

## Behavioral Rules
1. **Validation-First**: All deals MUST pass 9 gates (Schema, Trust, Dedupe, Reward, etc.). See `agents-docs/SYSTEM_REFERENCE.md`.
2. **Incremental Changes**: Prefer architectural consistency and small, verified steps over speculative rewrites.
3. **Context Hygiene**: Swallow passing output; surface failures only. Follow `agents-docs/CONTEXT.md`.
4. **Direct Action**: Proceed immediately when intent is clear; minimize unnecessary clarification requests. Infer from existing patterns first.
5. **Operational Safety**: Coordinate modifications to shared 'hot files' (e.g., `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`).

## Infrastructure Contracts
### KV Namespaces
- **DEALS_PROD**: Immutable production snapshots.
- **DEALS_STAGING**: Mutable candidate deals for validation.
- **DEALS_LOG**: Execution logs and pipeline metrics.
- **DEALS_LOCK**: Concurrency control.
- **DEALS_SOURCES**: Source registry and trust scores.

### Scheduled Triggers
- **`0 */6 * * *`**: Discovery pipeline (every 6h).
- **`0 9 * * *`**: Expirations and experience aggregation.
- **`0 0 * * SUN`**: Weekly full validation sweep.

## PR & Commit Instructions
- **MANDATORY**: PR titles and Commit headers MUST follow `type(scope): subject`.
- **Commit Type Mapping**:
  - `fix(security)`: Security patch / hardening.
  - `feat(security)`: New security feature/control.
  - `ci(security)`: Security-related CI/tooling.
- **Formatting**: Subject line max 72 chars, lowercase. Wrap body at 100 chars. footer max 1000 chars.

## Maintenance & Verification
- **ADR Compliance**: Verify ADR registration and pattern adherence in `plans/`.
- **Plan Management**: Archive plans in `plans/` older than 60 days to `plans/archive/`.
- **Yamllint Safeguard**: New `.github/workflows/*.yml` files must include `# yamllint disable-line rule:truthy` on the `on:` line.

## Delegation Routing
- **Self-Execute**: 1 trivial isolated edit.
- **Delegate**: 2+ files, architectural changes, judgment required.
- **Swarm**: 5+ similar independent tasks (batch updates).

## Verification Priority
1. Typecheck / build (fast)
2. Unit tests (logic)
3. Integration tests (behavior)
4. Lint / format (style)

## Skills
- Canonical skills in `.agents/skills/`.
- Claude/Qwen/Gemini: symlinks in `.<tool>/skills/`.
- Run `./scripts/setup-skills.sh` to refresh symlinks.

## Post-Task Protocol
Append JSON entry to `.agents/metrics.jsonl`:
`{"timestamp": "YYYY-MM-DDTHH:MM:SSZ", "agent": "id", "task": "desc", "skill_used": "skill|null", "status": "completed|failed", "tokens_used": int, "duration_seconds": int, "notes": "text"}`
