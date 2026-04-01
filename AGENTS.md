# AGENTS.md - Deal Discovery System

**Goal**: Build autonomous deal discovery system with coordinated AI agents
**Version**: 1.0.0
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

## Current Status

See state.json for current agent status and progress.

## Reference

| Resource         | Location                                                           |
| ---------------- | ------------------------------------------------------------------ |
| System Reference | [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) |
| Agent Specs      | [agents-docs/agents/](agents-docs/agents/)                         |
| Guard Rails      | [agents-docs/guard-rails.md](agents-docs/guard-rails.md)           |
| Coordination     | [agents-docs/coordination/](agents-docs/coordination/)             |
| API Docs         | [docs/API.md](docs/API.md)                                         |
| Skills           | [.agents/skills/](.agents/skills/)                                 |

## Skills

**Local** (in `.agents/skills/`): `agent-coordination`, `goap-agent`, `task-decomposition`, `parallel-execution`

**External** (Cloudflare): `cloudflare`, `agents-sdk`, `durable-objects`, `wrangler`, `workers-best-practices`

Use: `skill <name>` to load guidance.

## Endpoints

`/deals` · `/deals.json` · `/health` · `/metrics` · `/api/status` · `/api/log` · `/api/submit` · `/api/discover`

See [docs/API.md](docs/API.md) for endpoint documentation.

## Active Agents

| Agent               | Status  | Phase           | Responsibility      |
| ------------------- | ------- | --------------- | ------------------- |
| test-agent-v2       | pending | Test & Validate | Integration testing |
| validation-agent-v2 | pending | Test & Validate | 9 validation gates  |
| doc-agent           | pending | Test & Validate | Documentation       |
| github-agent        | pending | Test & Validate | GitHub integration  |
| browser-agent       | pending | Test & Validate | Browser testing     |
