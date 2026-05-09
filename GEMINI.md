@AGENTS.md

# Gemini CLI Overrides

## Context Advantage
- **Large Window**: Gemini can ingest full agent specs and codebase files without offset/limit concerns.
- **Deep Analysis**: Use for cross-file pattern recognition and complex deal extraction logic.

## Behavioral Constraints
- **Sequential Execution**: No native sub-agent support in Gemini CLI. Use sequential task decomposition.
- **Manual Skills**: No `skill` command. Read `.agents/skills/` files directly.
- **Verbose Output**: Leverage large context for detailed test failure analysis (use `npm run test:ci`).

## Target Files
- Check `agents-docs/` for exhaustive reference material.
- Use for comprehensive documentation and architecture reviews.
