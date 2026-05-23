@AGENTS.md

# Claude Code Overrides

## Tool Preferences
- **Read**: Prefer offset/limit for large files (avoid 2k+ line reads).
- **Grep**: Use `Glob` before `Grep` for efficiency.
- **MCP**: Primary interface for system interaction.
- **Batching**: Group independent `Bash` calls.

## Constraints
- **AGENTS.md**: Follow limits in AGENTS.md.
- **Skills**: Load via `skill <name>` (e.g., `skill agent-coordination`).

## Sub-Agents
Available in `.claude/agents/` and referenced in `agents-docs/agents/`. Use as **context firewalls**.
