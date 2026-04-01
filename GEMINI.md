@AGENTS.md

# Gemini CLI Overrides

## Context Window

- 1M context - can reference full agent specs
- Use `gemini` command for research tasks

## Limitations

- No sub-agent support

## Best Practices

- Focus on research and analysis tasks
- Leverage large context for codebase-wide analysis
- Reference full files without offset/limit concerns

## Testing

- Run `npm run test:ci` for headless test execution
- Full test output available (larger context)
