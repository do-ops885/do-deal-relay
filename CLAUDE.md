@AGENTS.md

# Claude Code Overrides

## Tool Preferences
- **Read**: Prefer offset/limit for large files (avoid 2k+ line reads).
- **Grep**: Use `Glob` before `Grep` for efficiency.
- **MCP**: Primary interface for system interaction.
- **Batching**: Group independent `Bash` calls.

## Constraints
- **AGENTS.md**: Keep under 150 lines (move details to `agents-docs/`).
- **Source Files**: Max 500 lines per file.
- **Skills**: Load via `skill <name>` (e.g., `agent-coordination`).

## Sub-Agents
Available in `.opencode/agents/`:
- `discovery-agent`, `validation-agent`, `scoring-agent`, `storage-agent`, `publish-agent`, `test-agent`.
