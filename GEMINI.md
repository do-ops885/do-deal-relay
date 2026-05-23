@AGENTS.md

# Gemini CLI Overrides

## Context Advantage
- **Large Window**: Gemini can ingest full agent specs and codebase files.
- **Deep Analysis**: Use for cross-file pattern recognition and TRIZ-analysis.

## Behavioral Constraints
- **Sequential Execution**: No native sub-agent support. Use sequential task decomposition.
- **Manual Skills**: No `skill` command. Read `.agents/skills/` files directly.
- **Verbose Output**: Leverage large context for detailed test failure analysis.
