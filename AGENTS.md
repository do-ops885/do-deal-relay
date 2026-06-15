# Agent Coordination Hub - do-deal-relay
**Version**: 0.1.7

## Core Constraints
```bash
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_AGENTS_MD=200
readonly TRUST_THRESHOLD=0.3
```
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

## Development Phases
1. **ANALYZE**: Deeply analyze repo before asking questions. Minimize low-value clarification requests. Check CI status (`plans/GOAP_STATE.md` or `./scripts/check-ci-status.sh`).
2. **DECOMPOSE**: Enter Deep Planning Mode. Confirm assumptions with user. Break into atomic tasks in `plans/`.
3. **EXECUTE**: Implement with atomic commits. Run `./scripts/quality_gate.sh` after each.
4. **SYNTHESIZE**: Update docs, extract learnings to `progress/LEARNINGS.md`.

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

## Behavioral Rules
1. **Validation-First**: All deals MUST pass 9 gates. See [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md).
2. **Incremental Changes**: Prefer architectural consistency and small, verified steps over speculative rewrites.
3. **Context Hygiene**: Swallow passing output. See [agents-docs/CONTEXT.md](agents-docs/CONTEXT.md).
4. **Tooling**: Use `./scripts/bootstrap.sh` for setup and `./scripts/doctor.sh` for diagnostics.

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
`{"timestamp": "ISO-8601", "agent": "id", "task": "desc", "skill_used": "skill|null", "status": "completed|failed", "tokens_used": int, "duration_seconds": int, "notes": "text"}`
