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

## PEV Loop (Plan-Execute-Verify)
Core workflow for all non-trivial tasks. See `plans/PEV_LOOP.md` for full spec.

```
PLAN → EXECUTE → VERIFY → [pass: PR] / [fail: re-plan]
```

- **Plan**: Produce structured spec with `approach`, `non_goals`, `acceptance_criteria`. Use `plans/SPEC_TEMPLATE.md`.
- **Execute**: Implement in isolated context. Agent never self-certifies.
- **Verify**: Run `./scripts/pev-gates.sh` — independent checks the author cannot bypass.
- **Human boundaries**: Plan approval (highest ROI), verify escalation, merge decision.

## Development Phases
We use a Goal-Oriented Action Planning (GOAP) approach combined with Architectural Decision Records (ADRs) and TRIZ for structured development.

1. **ANALYZE & STRATEGIZE (Phase 1)**
   - **Analyze-First**: Analyze repo structure and existing infrastructure deeply before asking ANY clarification questions. Infer from existing patterns.
   - **TRIZ/ADR**: Use TRIZ-based analysis for complex deal-discovery logic. Write an ADR in `plans/`.
   - **CI Status**: Check CI status via `./scripts/agent-toolkit.sh doctor`. If not passing, the **Always-Fix Policy** applies.

2. **DECOMPOSE & PLAN (Phase 2)**
   - **Deep Planning Mode**: Enter Deep Planning Mode at start. Interaction required to confirm assumptions.
   - **GOAP**: Break into atomic tasks in `plans/GOAP_STATE.md`.

3. **EXECUTE & COORDINATE (Phase 3)**
   - **Atomic commits**: Execute tasks systematically with atomic commits.
   - **Always-Fix Policy**: Agents MUST fix any existing CI check, lint warning, or quality-gate finding found in the current context. Zero tolerance for regressive or inherited failures.
   - **Triage Protocol for unfixable issues**: If a failure cannot be fixed (e.g., external dependency broken, requires human credential):
     1. Create an ADR in `plans/` documenting root cause and why it's out of scope.
     2. Create a GOAP task in `plans/GOAP_STATE.md` with status `blocked` and ADR link.
     3. Ensure the branch is otherwise green.
   - **Quality Gate**: Run `./scripts/pev-gates.sh` after every change.

4. **SYNTHESIZE (Phase 4)**
   - **Documentation**: Update `README.md`, `docs/`, and `agents-docs/`.
   - **Extract learnings**: Append discoveries to `agents-docs/LEARNINGS.md` or nearest `AGENTS.md`.

## Behavioral Rules
1. **Analyze-First**: Exhaustive repository analysis before asking questions. Minimize unnecessary clarification requests.
2. **Always-Fix Policy**: Fix pre-existing issues in the current context immediately. No discussion, no deferral.
3. **Agentic Abstention**: If environmental infeasibility makes further tool calls wasteful, agents MUST abstain per `.agents/skills/agentic-abstention/SKILL.md`.
4. **Validation-First**: All deals MUST pass 9 gates (Schema, Trust, Dedupe, Reward, etc.). See `agents-docs/SYSTEM_REFERENCE.md`.
5. **Incremental Changes**: Prefer architectural consistency and small, verified steps over speculative rewrites.
6. **Context Hygiene**: Swallow passing output; surface failures only. Follow `agents-docs/CONTEXT.md`.
7. **Operational Safety**: Coordinate modifications to shared 'hot files' (e.g., `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`).

## TypeScript Anti-Patterns (Codacy/Gate Enforcement)

### Banned Patterns

| Pattern | Issue | Fix |
|---------|-------|-----|
| Unused imports | Dead code, Codacy warning | Remove import or use `_` prefix for side-effect imports |
| `x !== undefined` after regex match (without `noUncheckedIndexedAccess`) | Always true when match succeeds | Remove conditional wrapper |
| `x!` (non-null assertion) | Bypasses null checks, forbidden | Use type guard or restructure |

### Regex Match Groups
When `path.match(/regex/)` succeeds, capture groups `[1]`, `[2]`, etc. have different types based on tsconfig:

**With `noUncheckedIndexedAccess: true`** (our config):
```typescript
const match = path.match(/^\/api\/([^/]+)$/);
if (match) {
  const id = match[1] ?? ""; // string | undefined → string (use ?? fallback)
  // OR
  const id = match[1]; // string | undefined (handle in type system)
}
```

**Without `noUncheckedIndexedAccess`**:
```typescript
const match = path.match(/^\/api\/([^/]+)$/);
if (match) {
  const id = match[1]; // string (safe, no ?? needed)
}
```

**Correct patterns:**
```typescript
// With noUncheckedIndexedAccess (our config)
const id = match[1] ?? "";           // Safe fallback
const id = match[1] ?? "default";    // Custom fallback

// Without noUncheckedIndexedAccess
const id = match[1];                 // Already string
```

**Incorrect patterns (avoid):**
```typescript
if (match[1] !== undefined) { ... } // Redundant with noUncheckedIndexedAccess
handleRequest(match[1]!, env);      // Forbidden non-null assertion
```

## Operational Tools
Agents SHOULD use the unified toolkit for common operations:
```bash
./scripts/agent-toolkit.sh setup    # Environment setup
./scripts/agent-toolkit.sh doctor   # Health check
./scripts/agent-toolkit.sh quality  # Run quality gate
./scripts/agent-toolkit.sh docs     # Documentation sync
./scripts/pev-gates.sh              # PEV verification gates
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

## Performance & Commit Standards (Zero Slop)
- **Zero Slop Directive**: Conversational filler, emojis, and markdown formatting in commit bodies are forbidden.
- **PR Descriptions**: Use plain text with 'What', 'Why', and 'Impact' sections. Include metric improvements.
- **Benchmarking**: Create micro-benchmarks in `scripts/`; execute via `npx tsx scripts/<script>.ts`.

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
- **Skill Standardization**: Skills in `.agents/skills/` must include YAML frontmatter and `## Rationalizations`/`## Red Flags` sections.
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

## GOAP Swarm Protocols

### Re-Verification Protocol (Prevents Stale Deferrals)
Before executing any GOAP plan with deferred items:
1. Launch a lightweight re-verification agent per deferred item
2. Agent checks: "Is the original deferral rationale still valid?"
3. Items with no code change since deferral → investigate (15 min) before re-deferring
4. Items older than 30 days without re-verification → auto-flag for review

### Incremental Validation (Post-Swarm)
After swarm execution, validate incrementally (not full suite):
1. Typecheck on changed files only (`npx tsc --noEmit`)
2. Tests in changed directories only (`npx vitest run <dir>`)
3. Format on new/modified files only (`npx prettier --check <files>`)
4. Full suite runs only before PR merge

### Research→Implement Pattern
For complex GOAP tasks, always launch research agents before implementation:
- Research phase: identify quick wins, feasibility, migration plans
- Implementation phase: only act on research findings
- Prevents "implement then discover it was wrong" cycles

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
