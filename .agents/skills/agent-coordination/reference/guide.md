# Agent Coordination Reference Guide

Detailed documentation for agent coordination patterns.

## Available Patterns

### Execution Strategies

- **[PARALLEL.md](PARALLEL.md)** - Execute independent tasks simultaneously
- **[SEQUENTIAL.md](SEQUENTIAL.md)** - Execute dependent tasks in order
- **[HYBRID.md](HYBRID.md)** - Mixed parallel/sequential workflows
- **[ITERATIVE.md](ITERATIVE.md)** - Progressive refinement loops
- **[SWARM.md](SWARM.md)** - Multi-perspective analysis

### Quick Reference

| Strategy   | Use When                | Coordination   | Risk   |
| ---------- | ----------------------- | -------------- | ------ |
| Parallel   | Independent tasks       | Independent    | Low    |
| Sequential | Dependent tasks         | Ordered        | Medium |
| Swarm      | Complex analysis        | Independent    | Low    |
| Hybrid     | Multi-phase work        | Mixed          | Medium |
| Iterative  | Progressive improvement | Feedback loops | Low    |

## Further Reading

- Main SKILL.md in parent directory
- HARNESS.md for harness engineering
- SUB-AGENTS.md for context isolation
