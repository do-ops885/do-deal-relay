# GOAP Agent Reference Guide

Goal-Oriented Action Planning (GOAP) for autonomous agents.

## Execution Strategies

See [execution-strategies.md](execution-strategies.md) for detailed patterns including:

- Goal decomposition
- Action planning
- World state management
- Plan execution and replanning

## Core Concepts

1. **World State** - Current environment representation
2. **Goals** - Desired end states
3. **Actions** - Operations that change world state
4. **Planner** - Finds action sequences to reach goals

## Integration

Use with `skill goap-agent` to load the main skill.

## Examples

### Simple Goal Achievement

```typescript
const worldState = { hasData: false, isProcessed: false };
const goal = { isProcessed: true };
const actions = [
  { name: "fetch", preconditions: {}, effects: { hasData: true } },
  {
    name: "process",
    preconditions: { hasData: true },
    effects: { isProcessed: true },
  },
];
```

## See Also

- Main SKILL.md in parent directory
- agents-docs/ for detailed specs
