@AGENTS.md

# Claude Code Overrides

## Tool Preferences

- Prefer `Read` with offset/limit for large files (avoid reading full 2000 lines)
- Use `Glob` before `Grep` for broad searches
- Batch independent `Bash` calls in parallel (single message, multiple tools)
- Use `skill` tool to load coordination patterns

## Context Management

- Use `/clear` between unrelated tasks
- Load skills progressively: `skill agent-coordination`
- Keep AGENTS.md under 150 lines; put details in agents-docs/
- Max 500 lines per source file

## Testing Requirements

- Run `npm run test:ci` before completing tasks
- Vitest is the test runner
- Coverage target: >80%
- Mock external services (KV, fetch)
- All code changes must include tests

## Sub-Agent Usage

- Delegate isolated research to sub-agents
- Available sub-agents in `.opencode/agents/`:
  - `discovery-agent` - Web scraping tasks
  - `validation-agent` - Validation gates
  - `scoring-agent` - Trust scoring
  - `storage-agent` - KV operations
  - `publish-agent` - Deployment tasks
  - `notify-agent` - Alert systems
  - `test-agent` - Test creation
  - `bootstrap-agent` - Setup/config

## Code Style

- TypeScript strict mode (no implicit any)
- camelCase variables, PascalCase types
- Minimal comments - code should be self-documenting
- Conventional commits: `feat:`, `fix:`, `docs:`, `ci:`, `test:`, `refactor:`

## Quality Gates

- Always run `./scripts/quality_gate.sh` before committing
- Silent on success, loud on failure
- Pre-commit hook automatically installed
