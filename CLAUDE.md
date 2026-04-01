@AGENTS.md

# Claude Code Overrides

## Tool Preferences

- Prefer `Read` with offset/limit for large files
- Use `Glob` before `Grep` for broad searches
- Batch independent `Bash` calls in parallel
- Use `skill` tool to load coordination patterns

## Context Management

- Use `/clear` between unrelated tasks
- Keep AGENTS.md under 150 lines; put details in agents-docs/

## Sub-Agent Usage

- Delegate isolated research to sub-agents
- Available in `.opencode/agents/`: discovery, validation, scoring, storage, publish, notify, test, bootstrap

## Quality Gates

- Always run `./scripts/quality_gate.sh` before committing
- Silent on success, loud on failure
