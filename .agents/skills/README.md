# .agents/skills/ - Agent Skills Library

This directory contains specialized skills for coordinating AI agents in the deal discovery system.

## Skills Overview

| Skill                 | Description                                                                         | Impact                                            |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `agent-coordination/` | Multi-agent orchestration patterns (hybrid, iterative, parallel, sequential, swarm) | **Critical** - Matches your 9-agent state machine |
| `goap-agent/`         | Goal-Oriented Action Planning for complex tasks                                     | **Critical** - Formalizes your state machine      |
| `task-decomposition/` | Break complex tasks into manageable steps                                           | **High** - Helps implement checklist              |
| `parallel-execution/` | Parallel task execution patterns                                                    | **High** - Speeds discovery phase                 |

## External Cloudflare Skills (Installed)

**Platform Skills** (global install at `~/.agents/skills/`):

| Skill                     | Purpose                                                            | Status       |
| ------------------------- | ------------------------------------------------------------------ | ------------ |
| `cloudflare/`             | Comprehensive platform (Workers, Pages, KV, R1, R2, AI, Vectorize) | ✅ Installed |
| `agents-sdk/`             | Building stateful AI agents with state, scheduling, RPC, MCP       | ✅ Installed |
| `durable-objects/`        | Stateful coordination, RPC, SQLite, alarms, WebSockets             | ✅ Installed |
| `wrangler/`               | Deploying and managing Workers, KV, R2, D1, Vectorize              | ✅ Installed |
| `workers-best-practices/` | Core Web Vitals, performance optimization                          | ✅ Installed |

**MCP Servers** (available via Cloudflare plugin):

- `cloudflare-docs` - Up-to-date Cloudflare documentation
- `cloudflare-bindings` - Build Workers with storage/AI/compute
- `cloudflare-builds` - Workers build insights
- `cloudflare-observability` - Debug logs and analytics

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

**Cloudflare Platform**:

- Load: `skill cloudflare` - Platform knowledge
- Load: `skill agents-sdk` - Agent development
- Load: `skill wrangler` - Deployment help
- Load: `skill durable-objects` - State coordination

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
skill cloudflare
skill agents-sdk
skill wrangler
```

## Installation

### Local Skills (This Directory)

These are project-specific coordination skills already present in `.agents/skills/`.

### External Skills (Cloudflare Platform)

Installed globally at user level:

```bash
npx skills add https://github.com/cloudflare/skills
```

Installs to:

- GitHub Copilot: `~/.github/skills/`
- OpenCode: `~/.config/opencode/skills/`
- Cursor: `~/.cursor/skills/`

## Source

Local skills adapted from [github-template-ai-agents](https://github.com/d-o-hub/github-template-ai-agents/tree/main/.agents/skills) for this deal discovery system.

Cloudflare skills from [cloudflare/skills](https://github.com/cloudflare/skills).
