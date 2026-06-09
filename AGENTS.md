# Agent Coordination Hub - do-deal-relay
**Version**: 1.2.0

## Core Constraints
Essential bounds for all agents.
```bash
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_AGENTS_MD=200
readonly TRUST_THRESHOLD=0.3  # Production default
readonly MAX_DEALS_PER_RUN=1000
```
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

## Development Phases
We use a GOAP approach combined with structured development.
1. **ANALYZE** - Understand the problem, check CI status (`./scripts/check-ci-status.sh`)
2. **DECOMPOSE** - Break into atomic tasks, write plan in `plans/`
3. **EXECUTE** - Implement with atomic commits, run quality gate after each
4. **SYNTHESIZE** - Update docs, extract learnings

## Infrastructure Contracts
### KV Namespaces
- **DEALS_PROD**: Immutable production snapshots (JSON).
- **DEALS_STAGING**: Mutable candidate deals for validation.
- **DEALS_LOG**: Execution logs and pipeline metrics.
- **DEALS_LOCK**: Concurrency control (`discovery_lock`).
- **DEALS_SOURCES**: Source registry and trust scores.

### Scheduled Triggers
- **`0 */6 * * *`**: Discovery pipeline (every 6h).
- **`0 9 * * *`**: Expirations and experience aggregation.
- **`0 0 * * SUN`**: Weekly full validation sweep.

## Behavioral Rules
1. **Validation-First**: All deals MUST pass 9 gates. See [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md).
2. **Staging-Only**: Never write directly to `DEALS_PROD`. Use `publishSnapshot`.
3. **Atomic Commits**: Use `./scripts/ai-commit.sh` for all changes.
4. **Quality Gates**: Run `./scripts/quality_gate.sh` before any submission.
5. **Typed Tools**: Follow signatures in [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md).

## Delegation Routing
- **Self-Execute**: 1 trivial isolated edit (typos, single-line constants)
- **Delegate**: 2+ files, architectural changes, tasks requiring judgment
- **Swarm**: 5+ similar independent tasks (batch refactors, multi-file updates)
- **Route**: research-agent (discovery) → code-crafter (implementation) → parallel-execution (batch)

## Verification Priority
1. Typecheck / build (fast, deterministic)
2. Unit tests (validates logic)
3. Integration tests (validates behavior)
4. Lint / format (enforces style)

## Reference Docs
- [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) — Tool signatures & gate details.
- [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md) — Limits & safety rules.
- [agents-docs/accuracy-guardrails.md](agents-docs/accuracy-guardrails.md) — Verification checklists.

## Skills
- Use canonical skills in `.agents/skills/` (e.g., `typescript-coding-standards`, `validation-gates`).
- Load via `skill <name>` (Claude) or direct read (Gemini/Qwen).

## Post-Task Protocol
Append to `.agents/metrics.jsonl`:
```json
{"timestamp": "<ISO-8601>", "agent": "<id>", "task": "<desc>", "skill_used": "<skill|null>", "status": "completed|failed|partial", "tokens_used": <int>, "duration_seconds": <int>, "notes": "<text>"}
```
