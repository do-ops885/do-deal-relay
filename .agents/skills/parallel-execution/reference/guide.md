# Parallel Execution Reference Guide

Detailed patterns for parallel task execution.

## Examples

### Simple Parallel Review

Decompose work into independent chunks executed simultaneously.

### Multi-Module Testing

Run tests for different modules in parallel.

### Quality Check

Run linting, type-checking, and unit tests concurrently.

## Performance Considerations

- Ideal speedup: Nx for N parallel tasks
- Realistic speedup: 0.7-0.9 \* N (overhead)
- Diminishing returns after 5-8 parallel tasks
- Network/IO bound tasks benefit more than CPU bound

## Best Practices

- Ensure true independence (no shared mutable state)
- Use appropriate concurrency limits
- Handle partial failures gracefully
- Aggregate results carefully

## Error Handling

### Strategies

1. **Fail Fast** - Cancel all on first error
2. **Best Effort** - Continue others, report failures
3. **Partial Success** - Return successful results only

## See Also

- Main SKILL.md in parent directory
- agent-coordination/SKILL.md for general patterns
