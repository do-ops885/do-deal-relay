@AGENTS.md

# Gemini CLI Overrides

## Context Window

- Gemini has larger context window - can reference full agent specs
- Use `gemini` command for research tasks
- Good for analyzing complex deal extraction patterns

## Limitations

- No sub-agent support in Gemini CLI (use OpenCode sub-agents instead)
- Use sequential task breakdown instead of parallel delegation
- No skill loading via `skill` command (read `.agents/skills/` directly)

## Best Practices

- Focus on research and analysis tasks
- Use for understanding deal patterns across sources
- Leverage large context for codebase-wide analysis
- Reference full files without offset/limit concerns

## Testing

- Run `npm run test:ci` for headless test execution
- Full test output available (larger context allows verbose output)

## Documentation

- Check agents-docs/ for detailed reference material
- Use for comprehensive documentation reviews
