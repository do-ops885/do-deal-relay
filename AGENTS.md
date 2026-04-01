# AGENTS.md - Master Coordination Hub

**Goal**: Autonomous deal discovery with coordinated multi-agent CLI systems
**Version**: 1.0.0
**Architecture**: Agent-First CLI with swarm coordination
**Status**: Active Development

## Quick Start

```bash
npm install                    # Install dependencies
./scripts/quality_gate.sh      # Validate all systems
npm run test:ci                # Run test suite
npm run dev                    # Start development
```

## Available Agents Matrix

| Agent      | CLI      | Context | Strengths                  | Sub-Agents | Skill Cmd |
| ---------- | -------- | ------- | -------------------------- | ---------- | --------- |
| **Claude** | `claude` | 200K    | Code, planning, file ops   | Yes        | Yes       |
| **Gemini** | `gemini` | 1M      | Research, large context    | No         | No        |
| **Qwen**   | `qwen`   | 128K    | TS/JS patterns, validation | No         | No        |

See `CLAUDE.md`, `GEMINI.md`, `QWEN.md` for CLI-specific overrides.

## Agent-First CLI Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Agent CLI  │────→│  AGENTS.md  │────→│ Skill System│
│ (3 options) │     │ (this file) │     │ (.agents/)  │
└─────────────┘     └─────────────┘     └─────────────┘
         ↓                  ↓                  ↓
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │  Agent Spec │    │ Coordination│    │   Swarm     │
   │ (CLAUDE.md) │    │  Protocol   │    │  Execution  │
   │ (GEMINI.md) │    │             │    │             │
   │  (QWEN.md)  │    │             │    │             │
   └─────────────┘    └─────────────┘    └─────────────┘
```

**Core Principle**: All agents read AGENTS.md first, then apply CLI-specific overrides.

## Handoff Coordination Protocol

**Trigger Conditions**: Context limit, agent switch, task completion, parallel need.

**Handoff Steps**:

1. Current agent writes `temp/handoff-*.md` with: task status (done/partial/blocked), key decisions, next steps, relevant file paths
2. Update `agents-docs/coordination/handoff-log.jsonl`
3. Next agent reads handoff file + AGENTS.md + its own spec
4. Confirm understanding before proceeding

**Blocker Escalation**: 30min stuck → Escalate to `agents-docs/coordination/blockers.md` with issue, attempted fixes, relevant code, hypothesis.

See [agents-docs/coordination/](agents-docs/coordination/) for full protocol.

## Swarm Coordination Patterns

**Pattern 1: Research Swarm** (Gemini + Qwen) - Delegate web research tasks, aggregate in `temp/swarm-research-*.md`.

**Pattern 2: Validation Pipeline** (Claude + Qwen) - Run all 9 gates in parallel, aggregate results, fail fast.

**Pattern 3: Code Review Swarm** (Claude + Gemini) - Split by module (worker/, tests/, scripts/), each agent reviews + reports, consolidate findings.

Load `skill parallel-execution` for implementation.

## Web Research Integration

**Sources**: ProductHunt, GitHub Trending, Hacker News, RSS feeds.

**Research Command**:

```bash
skill goap-agent
research-task: "Find 10 AI devtools launched this week"
output: temp/research-*.md
```

**Integration Points**: Research → `temp/research-*.md` → Deal extraction pipeline → Update `worker/sources/`.

See [agents-docs/RESEARCH.md](agents-docs/RESEARCH.md) for source specifications.

## Project Structure

```
├── CLAUDE.md, GEMINI.md, QWEN.md  # Agent CLI specs (root level)
├── AGENTS.md                      # This coordination hub
├── .agents/skills/                # Coordination skills
├── agents-docs/                   # System documentation
│   ├── coordination/              # Handoff logs, blockers
│   ├── agents/                    # Agent specifications
│   └── handoffs/                  # Handoff templates
├── temp/                          # State, reports (gitignored)
└── worker/                        # Cloudflare Worker source
```

### Root Directory Policy

**Allowed**: Standard project files only (package.json, tsconfig.json, wrangler.toml, README.md, LICENSE, VERSION, .gitignore).

**MUST use subfolders**: Docs → agents-docs/, Reports → temp/, Scripts → scripts/, Tests → tests/.

See [agents-docs/guard-rails.md](agents-docs/guard-rails.md) for complete rules.

## State Management

| File                                         | Purpose                            |
| -------------------------------------------- | ---------------------------------- |
| `temp/state.json`                            | Active agent status, current phase |
| `temp/skills-lock.json`                      | External skill version tracking    |
| `agents-docs/coordination/handoff-log.jsonl` | Handoff history                    |
| `agents-docs/coordination/blockers.md`       | Escalated issues                   |

## Quality Gates

Always run `./scripts/quality_gate.sh` before handoff or completion:

1. TypeScript compilation
2. Unit tests (>80% coverage)
3. Validation gates
4. Security checks
5. Root directory organization

**Rule**: Silent on success, loud on failure.

## Next Steps & References

| Resource              | Location                                                           |
| --------------------- | ------------------------------------------------------------------ |
| System Architecture   | [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) |
| Coordination Protocol | [agents-docs/coordination/](agents-docs/coordination/)             |
| Guard Rails           | [agents-docs/guard-rails.md](agents-docs/guard-rails.md)           |
| Execution Plan        | [agents-docs/EXECUTION_PLAN.md](agents-docs/EXECUTION_PLAN.md)     |
| Skills Directory      | [.agents/skills/](.agents/skills/)                                 |
| API Documentation     | [docs/API.md](docs/API.md)                                         |
| Handoff Templates     | [agents-docs/handoffs/](agents-docs/handoffs/)                     |

**Active Agents**: See `temp/state.json` for current status and assignments.
