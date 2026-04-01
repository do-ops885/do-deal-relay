# AGENTS.md - Deal Discovery System

**Goal**: Build autonomous deal discovery system with coordinated AI agents  
**Version**: 0.1.0-alpha  
**Phase**: Bootstrap  
**Status**: In Development ⚠️ NOT PRODUCTION READY

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

**Architecture**: Two-phase publish (Staging → Production) with 10 validation gates  
**State Machine**: init→discover→normalize→dedupe→validate→score→stage→publish→verify→finalize  
**Infrastructure**: Cloudflare Workers + 5 KV namespaces  
**Schedule**: Every 6 hours

## Current Status

- **Phase 3**: 5 critical bug fixes ✅
- **Phase 4**: 5 safety enhancements ✅
- **Phase 5**: 5 quality improvements ✅
- **Phase 6**: 5 performance features ✅
- **Phase 7**: 5 feature enhancements 🔄 IN PROGRESS

**Metrics**: 148/148 tests passing, 10/10 validation gates, A- security grade

See [plans/PROGRESS.md](plans/PROGRESS.md) for detailed progress.

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

## Skills

**Local** (in `.agents/skills/`): `agent-coordination`, `goap-agent`, `task-decomposition`, `parallel-execution`

**External** (Cloudflare): `cloudflare`, `agents-sdk`, `durable-objects`, `wrangler`, `workers-best-practices`

Use: `skill <name>` to load guidance.

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

## Development Notes

⚠️ **NOT PRODUCTION READY** - This is v0.1.0-alpha in active development

- All changes are staged for review
- Full validation suite runs on every commit
- Two-phase deployment (staging → production) not yet active
- API endpoints subject to change
