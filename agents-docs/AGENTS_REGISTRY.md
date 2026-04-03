# Agents Registry

Centralized registry of all sub-agents and skills.

## Skills (Local)

| Skill | Location | Description |
|-------|----------|-------------|
| [`agent-coordination`](../.agents/skills/agent-coordination/) | `.agents/skills/` | Multi-agent orchestration patterns |
| [`github-readme`](../.agents/skills/github-readme/) | `.agents/skills/` | Create human-focused README.md files |
| [`goap-agent`](../.agents/skills/goap-agent/) | `.agents/skills/` | Goal-Oriented Action Planning |
| [`iterative-refinement`](../.agents/skills/iterative-refinement/) | `.agents/skills/` | Iterative code improvement patterns |
| [`parallel-execution`](../.agents/skills/parallel-execution/) | `.agents/skills/` | Parallel task execution patterns |
| [`skill-creator`](../.agents/skills/skill-creator/) | `.agents/skills/` | Create new skills with proper structure |
| [`task-decomposition`](../.agents/skills/task-decomposition/) | `.agents/skills/` | Break complex tasks into manageable steps |

## Pipeline Agents

Located in `agents-docs/agents/`:

- `bootstrap-agent` - Repository setup (complete)
- `storage-agent` - KV storage layer (complete)
- `discovery-agent` - Deal discovery (complete)
- `data-agent` - Data processing (complete)
- `scoring-agent` - Deal scoring (complete)
- `publish-agent` - Deal publishing (complete)
- `notify-agent` - Notifications (complete)
- `system-validation-agent` - System validation (complete)

See individual files in `agents-docs/agents/` for full specs.
