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
   - **Analyze-First**: Analyze repo structure and existing infrastructure deeply before asking ANY clarification questions. Infer from existing patterns.
   - **TRIZ/ADR**: Use TRIZ-based analysis for complex deal-discovery logic. Write an ADR in `plans/`.
   - **CI Status**: Check CI status via `./scripts/agent-toolkit.sh doctor`. If not passing, "Always-Fix" protocol applies.

2. **DECOMPOSE & PLAN (Phase 2)**
   - **Deep Planning Mode**: Enter Deep Planning Mode at start. Interaction required to confirm assumptions.
   - **GOAP**: Break into atomic tasks in `plans/GOAP_STATE.md`.

3. **EXECUTE & COORDINATE (Phase 3)**
   - **Atomic commits**: Execute tasks systematically with atomic commits.
   - **Always-Fix Pre-Existing Issues**: Agents MUST fix any existing CI check, lint warning, or quality-gate finding found in the current context. Zero tolerance for regressive or inherited failures.
   - **Triage protocol for unfixable issues**: If a failure cannot be fixed (e.g., external dependency broken, requires human credential):
     1. Create an ADR in `plans/` documenting root cause and why it's out of scope.
     2. Create a GOAP task in `plans/GOAP_STATE.md` with status `blocked` and ADR link.
     3. Ensure the branch is otherwise green.
   - **Quality Gate**: Run `./scripts/agent-toolkit.sh quality` after every change.

4. **SYNTHESIZE (Phase 4)**
   - **Documentation**: Update `README.md`, `docs/`, and `agents-docs/`.
   - **Extract learnings**: Append discoveries to `agents-docs/LEARNINGS.md` or nearest `AGENTS.md`.

## Behavioral Rules
1. **Analyze-First**: Exhaustive repository analysis before asking questions. Minimize unnecessary clarification requests.
2. **Always-Fix**: Fix pre-existing issues in the current context immediately. No discussion, no deferral.
3. **Agentic Abstention**: If environmental infeasibility makes further tool calls wasteful, agents MUST abstain per `.agents/skills/agentic-abstention/SKILL.md`.
4. **Validation-First**: All deals MUST pass 9 gates (Schema, Trust, Dedupe, Reward, etc.). See `agents-docs/SYSTEM_REFERENCE.md`.
5. **Incremental Changes**: Prefer architectural consistency and small, verified steps over speculative rewrites.
6. **Context Hygiene**: Swallow passing output; surface failures only. Follow `agents-docs/CONTEXT.md`.
7. **Operational Safety**: Coordinate modifications to shared 'hot files' (e.g., `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`).

## Operational Tools
Agents SHOULD use the unified toolkit for common operations:
```bash
./scripts/agent-toolkit.sh setup    # Environment setup
./scripts/agent-toolkit.sh doctor   # Health check
./scripts/agent-toolkit.sh quality  # Run quality gate
./scripts/agent-toolkit.sh docs     # Documentation sync
```

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
- **Branching Workflow**: `develop` → `main` (production).
  - `develop`: Active development. All PRs target `develop`.
  - `main`: Production. Only merged from `develop` after CI passes.
  - Feature branches: `feat/*`, `fix/*`, `chore/*` — branched from `develop`, PR to `develop`.
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
Append JSON entry to `.agents/metrics.jsonl` after every task.

**If task completed normally:**
```json
{"timestamp": "ISO8601", "agent": "name", "task": "description", "status": "completed"}
```

**If task ended with ABSTAIN:**
```json
{"timestamp": "ISO8601", "agent": "name", "task": "desc", "abstained": true, "abstention_reason": "code", "stopped_at_step": N, "resume_hint": "hint"}
```
