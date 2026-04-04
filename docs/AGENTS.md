# AGENTS.md - Deal Discovery System

**Goal**: Build autonomous deal discovery system with coordinated AI agents
**Version**: 0.1.2
**Phase**: Bootstrap
**Status**: In Development

## Quick Start

```bash
# Install dependencies
npm install
# Run quality gate (silent on success)
./scripts/quality_gate.sh
# Run tests
npm test
# Start development
npm run dev
```

## System Overview

**Architecture**: Two-phase publish (Staging → Production) with 9 validation gates
**State Machine**: init→discover→normalize→dedupe→validate→score→stage→publish→verify→finalize
**Infrastructure**: Cloudflare Workers + 5 KV namespaces
**Schedule**: Every 6 hours

See [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for full details.

## Project Structure

**IMPORTANT**: Only standard configuration files belong in root. All other files MUST use subfolders.

```
├── .github/workflows/    # CI/CD workflows
├── .agents/skills/       # Agent coordination skills
├── agents-docs/          # System documentation
├── docs/                 # API documentation
├── plans/                # Execution plans
├── scripts/              # Utility scripts
├── temp/                 # Analysis reports & state (gitignored)
├── tests/                # Test suite
└── worker/               # Cloudflare Worker source
```

### Root Directory Policy

**Allowed in root** (standard project files only):

- `.gitignore` - Git ignore patterns
- `package.json` - NPM manifest
- `package-lock.json` - NPM lockfile
- `tsconfig.json` - TypeScript config
- `vitest.config.ts` - Test runner config
- `wrangler.toml` - Cloudflare Workers config
- `README.md` - Main project documentation
- `VERSION` - Version file
- `LICENSE` - License file

**MUST use subfolders**:

- Documentation → `docs/` or `agents-docs/`
- Reports/status → `temp/`
- Scripts → `scripts/`
- Tests → `tests/`
- Generated files → `temp/`

See [guard-rails.md](agents-docs/guard-rails.md) for full file organization rules.

## Reference

| Resource         | Location                                                           |
| ---------------- | ------------------------------------------------------------------ |
| System Reference | [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) |
| Agent Specs      | [agents-docs/agents/](agents-docs/agents/)                         |
| Guard Rails      | [agents-docs/guard-rails.md](agents-docs/guard-rails.md)           |
| Coordination     | [agents-docs/coordination/](agents-docs/coordination/)             |
| Execution Plan   | [agents-docs/EXECUTION_PLAN.md](agents-docs/EXECUTION_PLAN.md)     |
| Lessons Learned  | [agents-docs/LESSONS.md](agents-docs/LESSONS.md)                   |
| API Docs         | [docs/API.md](docs/API.md)                                         |
| Skills           | [.agents/skills/](.agents/skills/)                                 |

## Skills

**Local** (in `.agents/skills/`): `agent-coordination`, `goap-agent`, `task-decomposition`, `parallel-execution`

**External** (Cloudflare): `cloudflare`, `agents-sdk`, `durable-objects`, `wrangler`, `workers-best-practices`

Use: `skill <name>` to load guidance.

## Endpoints

`/deals` · `/deals.json` · `/health` · `/metrics` · `/api/status` · `/api/log` · `/api/submit` · `/api/discover`

See [docs/API.md](docs/API.md) for endpoint documentation.

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build TypeScript
- `npm test` - Run tests in watch mode
- `npm run test:ci` - Run tests once (for CI)
- `npm run lint` - Type check
- `npm run validate` - Run validation gates
- `npm run format` - Format code with Prettier

### Quality Gates

Run `./scripts/quality_gate.sh` to execute all validation checks:

- TypeScript compilation
- Unit tests
- Validation gates
- Security checks
- Root directory file organization (via `./scripts/check-root-files.sh`)

## Active Agents

See `temp/state.json` for current agent status and progress.

| Agent               | Status  | Phase           | Responsibility      |
| ------------------- | ------- | --------------- | ------------------- |
| test-agent-v2       | pending | Test & Validate | Integration testing |
| validation-agent-v2 | pending | Test & Validate | 9 validation gates  |
| doc-agent           | pending | Test & Validate | Documentation       |
| github-agent        | pending | Test & Validate | GitHub integration  |
| browser-agent       | pending | Test & Validate | Browser testing     |

## Notes

- **Analysis Reports**: Generated reports and swarm analysis are stored in `temp/` (not tracked in git)
- **State Tracking**: Agent progress and system state tracked in `temp/state.json`
- **Skills Lock**: External skill versions tracked in `temp/skills-lock.json`
