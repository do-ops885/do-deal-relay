# .agents/skills/ - Agent Skills Library

This directory contains specialized skills for coordinating AI agents in the deal discovery system.

## Skills Overview

| Skill                 | Description                                                                         | Impact                                            |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `agent-coordination/` | Multi-agent orchestration patterns (hybrid, iterative, parallel, sequential, swarm) | **Critical** - Matches your 9-agent state machine |
| `goap-agent/`         | Goal-Oriented Action Planning for complex tasks                                     | **Critical** - Formalizes your state machine      |
| `task-decomposition/` | Break complex tasks into manageable steps                                           | **High** - Helps implement checklist              |
| `parallel-execution/` | Parallel task execution patterns                                                    | **High** - Speeds discovery phase                 |

## Quick Reference

### For Deal Discovery System

**State Machine Coordination** (Your 9-gate flow):

- See `agent-coordination/SEQUENTIAL.md` - Your init→discover→normalize→dedupe→validate→score→stage→publish→verify→finalize flow
- See `goap-agent/execution-strategies.md` - Strategy selection for mixed parallel/sequential work

**Multi-Source Discovery**:

- See `agent-coordination/PARALLEL.md` - Run multiple discovery agents simultaneously
- See `agent-coordination/SWARM.md` - Analyze deals from multiple perspectives

**Quality Gates** (Your 9 validation gates):

- See `agent-coordination/HYBRID.md` - Multi-phase workflows with gates
- See `agent-coordination/ITERATIVE.md` - Progressive refinement until criteria met

**Implementation**:

- See `task-decomposition/SKILL.md` - Break down your 10-item checklist
- See `goap-agent/SKILL.md` - Planning methodology

## Usage

Each skill contains:

- `SKILL.md` - Main documentation and quick start
- Additional `.md` files - Detailed patterns and strategies

Load a skill using:

```
skill agent-coordination
skill goap-agent
skill task-decomposition
skill parallel-execution
```

## Source

These skills are adapted from [github-template-ai-agents](https://github.com/d-o-hub/github-template-ai-agents/tree/main/.agents/skills) for this deal discovery system.
