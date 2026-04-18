# AGENTS.md - Deal Discovery System

**Goal**: Build autonomous deal discovery system with coordinated AI agents
**Version**: 0.1.3
**Phase**: Bootstrap
**Status**: In Development

## Named Constants

```bash
# File size limits (lines)
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_PER_SKILL_MD=250
readonly MAX_LINES_AGENTS_MD=150

# Retry and polling configuration
readonly DEFAULT_MAX_RETRIES=3
readonly DEFAULT_RETRY_DELAY_SECONDS=5
readonly DEFAULT_POLL_INTERVAL_SECONDS=5
readonly DEFAULT_MAX_POLL_ATTEMPTS=12
readonly DEFAULT_TIMEOUT_SECONDS=1800

# Git/PR configuration
readonly MAX_COMMIT_SUBJECT_LENGTH=72
readonly MAX_PR_TITLE_LENGTH=72
```

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

## Local Guard Rails 

Enhanced pre-commit and pre-push hooks now run the **same checks as GitHub Actions CI** locally:

```bash
# Install git hooks (run once after clone)
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
cp scripts/pre-push-hook.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```

**Pre-commit (10 gates)**: Secrets detection (17 patterns), file size limits, syntax validation, directory organization
**Pre-push (9 gates)**: TypeScript compilation, full test suite, validation gates, security audit, build verification

See [agents-docs/GUARD_RAILS.md](agents-docs/GUARD_RAILS.md) for complete documentation.

## Duplicate Issue Prevention 

GitHub workflows now check for **existing open issues before creating duplicates**:

**Affected Workflows**:
- `deploy-production.yml` - Checks for existing deployment/rollback issues
- `deploy-staging.yml` - Checks for existing staging issues

**Deduplication Logic**:
1. Query existing open issues with matching labels
2. Check if issue title contains the same commit SHA
3. Skip creation if duplicate found
4. Log message: "Issue already exists for deployment failure of <sha>"

**Labels Used for Deduplication**:
- Production: `deployment`, `production`, `failed`
- Rollback: `deployment`, `production`, `rollback`
- Staging: `deployment`, `staging`, `failed`

This prevents issue spam when workflows retry or fail consecutively.

## System Overview

**Architecture**: Two-phase publish (Staging → Production) with 9 validation gates
**State Machine**: init→discover→normalize→dedupe→validate→score→stage→publish→verify→finalize
**Infrastructure**: Cloudflare Workers + 5 KV namespaces + D1 Database
**Schedule**: Every 6 hours
**AI Integration**: MCP Server (Model Context Protocol 2025-11-25) for agent-to-system communication. MCP is the primary interface for agent interaction, providing tools for deal discovery, reporting, and pipeline management.

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
- `wrangler.jsonc` - Cloudflare Workers config
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

| Resource           | Location                                                           |
| ------------------ | ------------------------------------------------------------------ |
| System Reference   | [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) |
| Agent Specs        | [agents-docs/agents/](agents-docs/agents/)                         |
| Guard Rails        | [agents-docs/guard-rails.md](agents-docs/guard-rails.md)           |
| **Local Guard Rails** | **[agents-docs/GUARD_RAILS.md](agents-docs/GUARD_RAILS.md)**    |
| Coordination       | [agents-docs/coordination/](agents-docs/coordination/)             |
| Execution Plan     | [plans/EXECUTION_PLAN.md](plans/EXECUTION_PLAN.md)                 |
| Lessons Learned    | [agents-docs/LESSONS.md](agents-docs/LESSONS.md)                   |
| API Docs           | [docs/API.md](docs/API.md)                                         |
| Skills             | [.agents/skills/](.agents/skills/)                                 |

## Skills

**Local** (in `.agents/skills/`): `agent-coordination`, `goap-agent`, `task-decomposition`, `parallel-execution`, `web-doc-resolver`

**External** (Cloudflare): `cloudflare`, `agents-sdk`, `durable-objects`, `wrangler`, `workers-best-practices`, `building-mcp-server-on-cloudflare`

Use: `skill <name>` to load guidance.

> **Tip**: For web research tasks, use `web-doc-resolver` skill first - it uses a cost-effective cascade (llms.txt → direct fetch → Jina AI → paid APIs only as last resort) to minimize token usage.

## Endpoints

**Core**: `/deals` · `/deals.json` · `/health` · `/metrics`

**API**: `/api/status` · `/api/log` · `/api/submit` · `/api/discover`

**MCP (Model Context Protocol)**: `/mcp` · `/mcp/v1/tools/list` · `/mcp/v1/tools/call` · `/mcp/v1/info`

**D1 Database**: `/api/d1/search` · `/api/d1/stats` · `/api/d1/deals` · `/api/d1/migrations`

**Validation**: `/api/validate/url` · `/api/validate/batch` · `/api/deals/{code}/validate`

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

### Pre-Existing Issue Policy

**Fix ALL issues before completing any task.** Do not introduce new work while ignoring existing problems.

**Scope of Pre-Existing Issues**:
- Lint warnings and type errors
- Test failures (unit, integration, e2e)
- Security vulnerabilities (CVEs, dependency issues)
- Documentation gaps (missing docs, outdated content)
- Code style violations (formatting, naming, patterns)

**Process**:
1. Run quality gate: `./scripts/quality_gate.sh`
2. Note all failures and warnings
3. Fix ALL issues before proceeding with new work
4. Re-run quality gate to confirm all issues resolved
5. Only then complete the task

**Rationale**: Leaving issues unfixed creates technical debt and obscures the impact of new changes. Every task must improve the codebase, not compound existing problems.

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

## Development Standards

### Code Quality Rules

**1. No Magic Numbers**
- All numeric literals must be constants in `worker/config.ts` or local `CONFIG` objects
- Bad: `if (count > 100)` → Good: `if (count > CONFIG.MAX_RESULTS)`
- Bad: `setTimeout(fn, 5000)` → Good: `setTimeout(fn, CONFIG.TIMEOUT_MS)`

**2. Max 500 Lines Per Source File**
- Source files must not exceed 500 lines
- Split files when approaching limit: `feature.ts` → `feature/index.ts`, `feature/types.ts`, `feature/utils.ts`
- Guard rails enforce this automatically

**3. Atomic Git Commits**
- One logical change per commit
- Commit message format: `type(scope): Description under 72 chars`
- Each commit must pass quality gate independently
- No "fix typo" or "address review" commits - amend instead

**4. All Commits Verified with Tests**
- `./scripts/quality_gate.sh` must pass before every commit
- Includes: TypeScript compilation, unit tests, validation gates
- Pre-commit hooks block commits if tests fail
- CI will reject PRs with failing tests

### Skills Development Standards

**5. Real-World Skill Evaluations**
- Every new skill MUST include `evals/evals.json` with real-world test cases
- Evals must test actual usage scenarios, not synthetic examples
- Example: webhook skill evals test actual HTTP delivery to webhook.site
- Example: NLQ skill evals test real queries from users
- Use `temp/skill-eval-{name}.jsonl` for ongoing eval tracking

**6. End-to-End Usage Focus**
- Always test skills with real e2e scenarios before marking complete
- Create integration tests in `tests/integration/` for new features
- Skills must demonstrate real workflow usage, not just unit functions
- Document real-world usage examples in SKILL.md

### Verification Checklist

Before marking any task complete:
- [ ] No magic numbers (grep for literal values > 10, < 0)
- [ ] All source files < 500 lines
- [ ] Atomic commits (one logical change each)
- [ ] All tests passing
- [ ] Skill evals using real-world scenarios
- [ ] E2E integration tests written

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
- **Web Research**: Use `web-doc-resolver` skill for cost-effective research (free sources first, paid APIs last)
- **MCP Server**: Full Model Context Protocol 2025-11-25 implementation available at `/mcp`
- **D1 Database**: Full-text search and advanced queries available via `/api/d1/*`
