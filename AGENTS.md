# Agent Coordination Hub - do-deal-relay
**Version**: 1.1.0

## Core Constraints
Essential bounds for all agents.
```bash
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_AGENTS_MD=200
readonly TRUST_THRESHOLD=0.3  # Production default
readonly MAX_DEALS_PER_RUN=1000
```
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

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

## Reference Docs
- [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) — Tool signatures & gate details.
- [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md) — Limits & safety rules.
- [agents-docs/accuracy-guardrails.md](agents-docs/accuracy-guardrails.md) — Verification checklists.

## Skills
- Use canonical skills in `.agents/skills/` (e.g., `typescript-coding-standards`, `validation-gates`).
- Load via `skill <name>` (Claude) or direct read (Gemini/Qwen).

## Post-Task Protocol
Append to `.agents/metrics.jsonl`: `{"timestamp": "<ISO-8601>", "agent": "jules", "task": "<desc>", "status": "completed", "duration_seconds": <int>}`
