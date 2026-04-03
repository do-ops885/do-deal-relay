# AGENTS.md - Deal Discovery System

**Goal**: Build autonomous deal discovery system with coordinated AI agents
**Version**: 0.1.0
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
├── plans/                # Future implementation plans
├── reports/              # Permanent analysis reports
│   └── analysis/         # Detailed investigation outputs
├── scripts/              # Utility scripts
├── temp/                 # Temporary files (gitignored)
├── tests/                # Test suite
└── worker/               # Cloudflare Worker source
```

### Directory Usage Rules

| Directory   | Purpose                          | Committed? | Lifespan     |
| ----------- | -------------------------------- | ---------- | ------------ |
| `docs/`     | API & technical documentation    | ✅ Yes     | Permanent    |
| `agents-docs/` | System & agent documentation  | ✅ Yes     | Permanent    |
| `plans/`    | Future implementation plans      | ✅ Yes     | Until done   |
| `reports/`  | Analysis findings & learnings    | ✅ Yes     | Permanent    |
| `temp/`     | Temporary working files         | ❌ No      | Session only |
| `scripts/`  | Utility scripts                   | ✅ Yes     | Permanent    |
| `tests/`    | Test suite                        | ✅ Yes     | Permanent    |

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
- **Permanent reports** → `reports/` (use `reports/analysis/` for investigations)
- **Future plans** → `plans/`
- **Temporary work** → `temp/` (gitignored, not committed)
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
| Execution Plan   | [plans/EXECUTION_PLAN.md](plans/EXECUTION_PLAN.md)                 |
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

### Self-Learning Protocol

After every successful task completion, agents MUST:

1. **Evaluate for Lesson Worthiness**
   - Was this a novel problem?
   - Did we overcome an unexpected obstacle?
   - Is there prevention value for future agents?
   - Would this be hard to rediscover?

2. **If Yes - Document in LESSONS.md**
   ```markdown
   ### LESSON-XXX: Brief Title
   **Date**: YYYY-MM-DD
   **Component**: Which module/agent
   **Issue**: What went wrong
   **Root Cause**: Why it happened
   **Solution**: How it was fixed
   **Prevention**: How to avoid in future
   ```

3. **Update Active Context**
   - Add note to `temp/state.json` if state changed
   - Update AGENTS.md if process/structure changed
   - Cross-reference related lessons

4. **Log to JSONL** (for automated analysis)
   ```json
   {"lesson_id": "LESSON-XXX", "timestamp": "...", "tags": [...]}
   ```

**Trigger Phrases for Auto-Lesson Creation**:
- "Wait, why didn't that work?"
- "That was unexpected..."
- "Let's try a different approach"
- "Fixed it by..."
- "The issue was..."

See [agents-docs/LESSONS.md](agents-docs/LESSONS.md) for full format and examples.

## Active Agents

All pipeline agents are **complete**. See [agents-docs/AGENTS_REGISTRY.md](agents-docs/AGENTS_REGISTRY.md) for full registry.

| Agent               | Status   | Phase           | Responsibility      |
| ------------------- | -------- | --------------- | ------------------- |
| test-agent          | complete | Test & Validate | Integration testing |
| validation-agent    | complete | Test & Validate | 9 validation gates  |
| doc-agent           | complete | Test & Validate | Documentation       |
| github-agent        | complete | Test & Validate | GitHub integration  |
| browser-agent       | complete | Test & Validate | Browser/API testing |

## Notes

- **Permanent Reports**: Analysis findings go to `reports/` (committed, permanent record)
- **Analysis Work**: Detailed investigations go to `reports/analysis/`
- **Future Plans**: Roadmaps and specs go to `plans/`
- **Temp Files**: Working files in `temp/` are gitignored, session-only
- **State Tracking**: Agent progress tracked in `temp/state.json`
- **Skills Lock**: External skill versions tracked in `temp/skills-lock.json`
- **Validation Status**: All 9 validation gates passing
- **Self-Learning**: See Self-Learning Protocol above - document lessons after every task
- **Directory Guide**: See README files in each directory for usage rules
