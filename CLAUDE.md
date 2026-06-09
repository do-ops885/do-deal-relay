@AGENTS.md

# Claude Code Overrides
**Version**: 1.1.0

## Behavioral Contract
Extends [AGENTS.md](AGENTS.md). Claude must adhere to all Core Constraints and Infrastructure Contracts defined there.

## Tool Preferences
- **Read**: Prefer offset/limit for large files (avoid 2k+ line reads).
- **Grep**: Use `Glob` before `Grep` for efficiency.
- **MCP**: Primary interface for system interaction. See [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for typed tool signatures.
- **Batching**: Group independent `Bash` calls to minimize round-trips.

## Specific Constraints
- **AGENTS.md**: Strict 200-line limit for AGENTS.md.
- **Skills**: Load via `skill <name>` (e.g., `skill agent-coordination`). Canonical skills reside in `.agents/skills/`.
- **Validation**: Never bypass the 9 validation gates. Verify all deal submissions via `get_deal` after `add_referral`.

## Sub-Agents
Available in `.opencode/agents/` and referenced in `agents-docs/SUB-AGENTS.md`. Use for high-cost or specialized tasks.
