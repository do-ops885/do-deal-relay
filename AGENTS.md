# AGENTS.md - Deal Discovery System

> Single source of truth for all AI coding agents in this repository.
> Supported by: Claude Code, Gemini CLI, OpenCode, Qwen Code, Windsurf, Cursor

**Goal**: Build autonomous deal discovery system with coordinated AI agents  
**Version**: 1.0.0  
**Phase**: Bootstrap  
**Status**: In Development ⚠️ NOT PRODUCTION READY

## Quick Start

```bash
# Install dependencies
npm install

# Setup skill symlinks (run once after clone)
./scripts/setup-skills.sh

# Install git pre-commit hook
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

# Run quality gate (silent on success)
./scripts/quality_gate.sh

# Run tests
npm test

# Start development
npm run dev
```

## System Overview

**Architecture**: Two-phase publish (Staging → Production) with 10 validation gates  
**State Machine**: init→discover→normalize→dedupe→validate→score→stage→publish→verify→finalize  
**Infrastructure**: Cloudflare Workers + 5 KV namespaces  
**Schedule**: Every 6 hours

See [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for full details.

## Current Status

- **Phase 3**: 5 critical bug fixes ✅
- **Phase 4**: 5 safety enhancements ✅
- **Phase 5**: 5 quality improvements ✅
- **Phase 6**: 5 performance features ✅
- **Phase 7**: 5 feature enhancements 🔄 IN PROGRESS

**Metrics**: 148/148 tests passing, 10/10 validation gates, A- security grade

See [plans/PROGRESS.md](plans/PROGRESS.md) for detailed progress.

## Code Style

- **Max 500 lines per source file** - split into focused sub-modules if exceeded
- Conventional Commits: `feat:`, `fix:`, `docs:`, `ci:`, `test:`, `refactor:`
- All public APIs must be documented
- No hardcoded magic numbers - use named constants from `config.ts`
- Render architecture diagrams as fenced `mermaid` blocks, never raw ASCII art
- TypeScript: Strict mode enabled, no implicit `any`
- Shell scripts: Use `shellcheck` for linting
- Markdown: Use `markdownlint` for consistency

## Testing Instructions

- Write or update tests for every code change, even if not explicitly requested
- Tests must be deterministic - use seeded RNG where randomness is needed
- Success is silent; only surface failures (context-efficient back-pressure)
- Target coverage: >80%
- Mock external services (KV, fetch)

### Commands

```bash
# Run all tests
npm test

# CI mode (headless)
npm run test:ci

# Type check only
npm run lint

# Validate all gates
npm run validate

# Run quality gate
./scripts/quality_gate.sh
```

## PR Instructions

- Title format: `feat(scope): description` or `fix(scope): description`
- Always run lint and tests before committing: `./scripts/quality_gate.sh`
- Create a new branch per feature/fix - never commit directly to `main`
- Keep PRs focused; one concern per PR

## Security

- Never commit secrets or API keys - use environment variables or `.env` (gitignored)
- Never connect to untrusted MCP servers
- Report vulnerabilities via GitHub private advisories
- See [agents-docs/guard-rails.md](agents-docs/guard-rails.md) for full security details

## Skills

### Local (in `.agents/skills/`)

- `agent-coordination` - Multi-agent orchestration
- `goap-agent` - Goal-oriented planning
- `task-decomposition` - Task breakdown
- `parallel-execution` - Parallel workflows

### External (Cloudflare platform)

- `cloudflare` - Platform expertise (Workers, Pages, KV, D1, R2, AI)
- `agents-sdk` - Building stateful AI agents
- `durable-objects` - Stateful coordination
- `wrangler` - Deployment and management
- `workers-best-practices` - Performance optimization

**Usage**: `skill <name>` to load guidance.

**Setup**: Run `./scripts/setup-skills.sh` after cloning to create symlinks for Claude Code and Gemini CLI.

## Reference

| Resource         | Location                                                           |
| ---------------- | ------------------------------------------------------------------ |
| System Reference | [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) |
| Agent Specs      | [agents-docs/agents/](agents-docs/agents/)                         |
| Guard Rails      | [agents-docs/guard-rails.md](agents-docs/guard-rails.md)           |
| Coordination     | [agents-docs/coordination/](agents-docs/coordination/)             |
| API Docs         | [docs/API.md](docs/API.md)                                         |
| Skills           | [.agents/skills/](.agents/skills/)                                 |
| Progress         | [plans/PROGRESS.md](plans/PROGRESS.md)                             |

## Endpoints

Core: `/health` · `/metrics` · `/deals` · `/deals.json`  
API: `/api/discover` · `/api/status` · `/api/log` · `/api/submit`  
New: `/deals/ranked` · `/analytics` · `/api/webhooks`

See [docs/API.md](docs/API.md) for endpoint documentation.

## Active Agents (Phase 7 Swarm)

| Agent               | Status      | Phase           | Responsibility              |
| ------------------- | ----------- | --------------- | --------------------------- |
| feature-agent-1     | in_progress | Feature Enhance | Deal categorization/tagging |
| feature-agent-2     | in_progress | Feature Enhance | Deal ranking API            |
| feature-agent-3     | in_progress | Feature Enhance | Analytics dashboard         |
| feature-agent-4     | in_progress | Feature Enhance | Webhook support             |
| feature-agent-5     | in_progress | Feature Enhance | Expiration notifications    |
| test-agent-v2       | pending     | Test & Validate | Integration testing         |
| validation-agent-v2 | pending     | Test & Validate | 10 validation gates         |
| doc-agent           | in_progress | Test & Validate | Documentation updates       |

## Agent Guidance

### Plan Before Executing

For non-trivial tasks: produce a written plan first, pause, and wait for confirmation before writing code.

### Skills: Single Source in .agents/skills/

All skills live canonically in `.agents/skills/`. Claude Code and Gemini CLI use symlinks pointing back to `.agents/skills/`. OpenCode reads skills directly from `.agents/skills/` - no symlinks needed.

Run `./scripts/setup-skills.sh` after cloning to create symlinks for Claude Code and Gemini CLI.

### Context Discipline

- Delegate isolated research and analysis to sub-agents
- Use `/clear` between unrelated tasks
- Load skills only when needed, not upfront
- Success is silent; only surface failures

### Nested AGENTS.md

For sub-packages, place an additional `AGENTS.md` inside each sub-package. The agent reads the nearest file in the directory tree - closest one takes precedence.

## Development Notes

⚠️ **NOT PRODUCTION READY** - This is v0.1.0-alpha in active development

- All changes are staged for review
- Full validation suite runs on every commit
- Two-phase deployment (staging → production) not yet active
- API endpoints subject to change
