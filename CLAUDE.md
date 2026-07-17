@AGENTS.md

# Claude Code Overrides
**Version**: 1.2.0 (Schema: 0.1.8)

## Behavioral Contract
Extends [AGENTS.md](AGENTS.md). Claude must adhere to all Core Constraints and Infrastructure Contracts defined there.

## Tool Preferences
- **Read**: Prefer offset/limit for large files (avoid 2k+ line reads).
- **Grep**: Use `Glob` before `Grep` for efficiency.
- **MCP**: Primary interface for system interaction. See [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for typed tool signatures.
- **Batching**: Group independent `Bash` calls to minimize round-trips.
- **Unified Toolkit**: Use `./scripts/agent-toolkit.sh` for setup, doctor, quality, and docs tasks.
- **Always-Fix Policy**: Fix pre-existing issues in the current context immediately per [AGENTS.md](AGENTS.md).
- **Performance**: Adhere to the 'Zero Slop' directive in [AGENTS.md](AGENTS.md) for all commits.
- **Triage Protocol**: For unfixable/blocked issues, register a new ADR in `plans/` and mark the corresponding GOAP task as `blocked`.
- **Analyze-First**: Analyze repository structure, CI/CD setup, quality gates, and agent infrastructure deeply before asking ANY questions.
- **No Low-Value Questions**: Do not ask redundant questions that can be answered by the codebase itself.
- **Incremental & Non-Speculative**: Make small, incremental changes. Never speculatively rewrite core pipeline logic or validation gates.

## Specific Constraints
- **AGENTS.md**: Strict 200-line limit for AGENTS.md.
- **Skills**: Load via `skill <name>` (e.g., `skill agent-coordination`). Canonical skills reside in `.agents/skills/`.
- **Validation**: Never bypass the 9 validation gates. Verify all deal submissions via `get_deal` after `add_referral`.

## Sub-Agents
Available in `.opencode/agents/` and referenced in `agents-docs/SUB-AGENTS.md`. Use for high-cost or specialized tasks.
