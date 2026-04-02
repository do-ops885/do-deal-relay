# AGENTS.md - Master Coordination Hub

**Goal**: Autonomous deal discovery with coordinated multi-agent CLI systems
**Version**: 0.1.1
**Architecture**: Agent-First CLI with swarm coordination + Referral Management System
**Status**: Active Development - All Input Methods Implemented

## Quick Start

```bash
npm install                    # Install dependencies
./scripts/quality_gate.sh      # Validate all systems
npm run test:ci                # Run test suite
npm run dev                    # Start development

# CLI Tool for Referral Management
npx ts-node scripts/cli/index.ts --help
npx ts-node scripts/cli/index.ts auth login --endpoint http://localhost:8787
npx ts-node scripts/cli/index.ts codes add --code ABC123 --url https://example.com/invite/ABC123 --domain example.com
npx ts-node scripts/cli/index.ts codes deactivate ABC123 --reason expired
```

## Production Readiness Checklist

- [x] All input methods implemented (CLI, API, Extension, Bot, Email, Webhook)
- [x] All source files < 500 lines (completed)
- [x] URL preservation verified (complete links always returned)
- [x] GitHub Actions CI passing
- [x] All skills pass evaluator checks (completed)
- [ ] Security audit complete (see `plans/production-readiness.md`)
- [ ] Load testing complete (see `plans/production-readiness.md`)

## Tracking Warnings and Issues

**All warnings, TODOs, and issues must be tracked in `plans/` directory:**

1. When validation gates emit warnings (TODO/FIXME, security issues, HTTP URLs, etc.)
2. Create or update appropriate plan file in `plans/`
3. Document: issue, impact, solution, priority, assigned agent, ETA
4. Reference the plan file in AGENTS.md checklist items

**Example Plan Files:**

- `plans/production-readiness.md` - Security audit, load testing, warnings
- `plans/github-automation-plan.md` - GitHub Actions improvements
- `plans/<feature>-plan.md` - Feature-specific implementation plans

See `plans/production-readiness.md` for current tracking of all warnings and pending items.

## Code Quality Standards

**Max 500 lines per source file** - Split files exceeding this limit
**Atomic commits only** - Each change is independently verifiable
**Skill evaluation required** - All skills must pass evaluator checks
**URL preservation enforced** - Complete URLs always preserved and returned

## URL Handling Rules (CRITICAL)

### 1. Always Preserve Complete Links (Input)

When adding referral codes, **ALWAYS use the COMPLETE link** as provided by the user:

```bash
# CORRECT: Full link preserved
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# WRONG: Never use partial URLs
npx ts-node scripts/refcli.ts codes smart-add picnic.app/DOMI6869  # NEVER DO THIS
```

### 2. Full URL Always Returned (Output)

When querying the system, the **COMPLETE URL is always returned** in the `url` field:

```json
{
  "referral": {
    "id": "ref-abc123",
    "code": "DOMI6869",
    "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
    "domain": "picnic.app"
  }
}
```

**All API endpoints return full URLs:**

- `GET /api/referrals` - List includes complete `url` field
- `GET /api/referrals/:code` - Returns full `url`
- `POST /api/referrals` - Created referral includes full `url`
- `POST /api/referrals/:code/deactivate` - Returns full `url`
- `POST /api/referrals/:code/reactivate` - Returns full `url`

### 3. Agent Communication

When one agent queries the system and shares results with other agents, **the full URL must always be included**:

```
Agent A: Query system for picnic.app referrals
System: Returns { url: "https://picnic.app/de/freunde-rabatt/DOMI6869", ... }
Agent A: Shares with Agent B
Agent B: Receives FULL URL, not shortened version
```

## Recent Updates: Referral Management System (v1.0.0)

### New Features

- **Multi-Input Referral System**: CLI, API, Browser Extension, Chat Bot, Email, Webhooks
- **Web Research Agent**: Automatically discovers referral codes from ProductHunt, GitHub, HN, Reddit
- **Swarm Coordination**: Parallel agent execution with handoff protocol
- **Code Lifecycle Management**: Add, activate, deactivate, reactivate with reason tracking
- **Comprehensive Storage**: KV-based with indices for code, domain, status

### New Components

| Component        | Location                                                     | Purpose                          |
| ---------------- | ------------------------------------------------------------ | -------------------------------- |
| Referral Types   | `worker/types.ts`                                            | ReferralInput, Research schemas  |
| Referral Storage | `worker/lib/referral-storage/`                               | CRUD, search, deactivate         |
| Research Agent   | `worker/lib/research-agent/`                                 | Web discovery of codes           |
| API Endpoints    | `worker/routes/`                                             | REST API for referral management |
| CLI Tool         | `scripts/cli/`                                               | Command-line interface           |
| Swarm Config     | `agents-docs/coordination/input-methods-swarm-config.json`   | Agent orchestration              |
| Handoff Protocol | `agents-docs/coordination/input-methods-handoff-protocol.md` | Coordination rules               |

### API Endpoints (New)

```
GET    /api/referrals           # List/search referrals
POST   /api/referrals           # Create new referral
GET    /api/referrals/:code     # Get specific referral
POST   /api/referrals/:code/deactivate  # Deactivate with reason
POST   /api/referrals/:code/reactivate  # Reactivate
POST   /api/research            # Execute web research
GET    /api/research/:domain    # Get research results
```

## User Input Methods Analysis

A swarm of 6 agents analyzed all possibilities for user input. **Results**:

| Method                | Status                  | Document                     | Key Features                              |
| --------------------- | ----------------------- | ---------------------------- | ----------------------------------------- |
| **CLI**               | ✅ Implemented          | `temp/analysis-cli.md`       | oclif-based, auth, CRUD, import, research |
| **Web UI/API**        | ✅ API Done, UI Planned | `temp/analysis-web-ui.md`    | React + Vite, JWT auth, dashboard         |
| **Browser Extension** | ✅ Implemented          | `temp/analysis-extension.md` | MV3, auto-detect, context menu            |
| **Chat Bot**          | ✅ Implemented          | `temp/analysis-chatbot.md`   | Telegram/Discord, slash commands          |
| **Email Integration** | ✅ Implemented          | `temp/analysis-email.md`     | Forward parsing, command emails           |
| **Webhook/API**       | ✅ Implemented          | `temp/analysis-webhook.md`   | HMAC signed, bidirectional sync           |

**All input methods are now implemented!** Focus on optimization and production readiness.

## Handoff Coordination Protocol

**Trigger Conditions**: Context limit, agent switch, task completion, parallel need.

**Handoff Steps**:

1. Current agent writes `temp/handoff-*.md` with: task status (done/partial/blocked), key decisions, next steps, relevant file paths
2. Update `agents-docs/coordination/handoff-log.jsonl`
3. Next agent reads handoff file + AGENTS.md + its own spec
4. Confirm understanding before proceeding

**Context Window Management (CRITICAL)**:

To prevent context overflow, always delegate to sub-agents with isolated, focused contexts:

| Context Used      | Action                                    |
| ----------------- | ----------------------------------------- |
| <20% (healthy)    | Continue in current agent                 |
| 20-50% (elevated) | Consider task delegation                  |
| >50% (critical)   | Delegate to focused sub-agent immediately |

**Delegation Pattern**:

```
Parent Agent
├─→ Create handoff: temp/handoff-parent-sub.md
├─→ Delegate to Sub-Agent A (isolated context)
│   └─→ Sub-Agent A executes with <5 files
│   └─→ Sub-Agent A writes handoff result
├─→ Delegate to Sub-Agent B (isolated context)
│   └─→ Sub-Agent B executes with <5 files
│   └─→ Sub-Agent B writes handoff result
└─→ Aggregate results from handoffs
```

**Blocker Escalation**: 30min stuck → Escalate to `agents-docs/coordination/blockers.md` with issue, attempted fixes, relevant code, hypothesis.

**Referral-Specific Handoffs**: See [agents-docs/coordination/referral-handoff-protocol.md](agents-docs/coordination/referral-handoff-protocol.md)

See [agents-docs/coordination/](agents-docs/coordination/) for full protocol.
See [agents-docs/SUB-AGENTS.md](agents-docs/SUB-AGENTS.md) for sub-agent patterns.

## Swarm Coordination Patterns

**Pattern 1: Research Swarm** (Gemini + Qwen) - Delegate web research tasks, aggregate in `temp/swarm-research-*.md`.

**Pattern 2: Validation Pipeline** (Claude + Qwen) - Run all 9 gates in parallel, aggregate results, fail fast.

**Pattern 3: Code Review Swarm** (Claude + Gemini) - Split by module (worker/, tests/, scripts/), each agent reviews + reports, consolidate findings.

**Pattern 4: Referral Management Swarm** (All agents) - See `agents-docs/coordination/referral-swarm-config.json`

- Parallel: 6 interface agents (CLI, API, Extension, Bot, Email, Webhook)
- Sequential: Ingestion → Research → Validation → Deactivation → Synthesis
- Quality Gates: Schema validation, duplicate check, trust score

**Pattern 5: Continuous Verification Loop**

For complex tasks requiring iterative refinement:

```
Loop Until All Pass:
├─→ Spawn swarm of 3+ agents (different perspectives)
├─→ Each agent verifies and evaluates independently
├─→ Check for consensus (2 of 3 agree)
├─→ If consensus: BREAK loop, return result
├─→ If disagreement: Analyze conflicts, refine task
├─→ Create handoff with refined requirements
└─→ Loop again with fresh agents (prevent context bloat)
```

**Loop Requirements**:

1. Always use fresh agents in each iteration (no context carry-over)
2. Handoff documents carry state between iterations
3. Stop when all agents agree or max iterations reached (5)
4. Keep each agent's context under 50% by limiting files (<5 per agent)
5. Log each iteration to `temp/swarm-loop-log.jsonl`

Load `skill parallel-execution` for implementation.

## Web Research Integration

**Sources**: ProductHunt, GitHub Trending, Hacker News, RSS feeds, Reddit.

**Research Command**:

```bash
# Via CLI
npx ts-node scripts/refcli.ts research run --domain example.com --depth thorough

# Via API
curl -X POST http://localhost:8787/api/research \
  -H "Content-Type: application/json" \
  -d '{"query": "example referral code", "domain": "example.com", "depth": "thorough"}'

# Via Agent
skill goap-agent
research-task: "Find all referral codes for domain X"
output: temp/research-*.md
```

**Integration Points**: Research → `temp/research-*.md` → Deal extraction pipeline → Update `worker/sources/`.

**Research Agent**: `worker/lib/research-agent/` - Multi-source discovery, confidence scoring, result storage.

See [agents-docs/RESEARCH.md](agents-docs/RESEARCH.md) for source specifications.

## Project Structure

```
├── CLAUDE.md, GEMINI.md, QWEN.md  # Agent CLI specs (root level)
├── AGENTS.md                      # This coordination hub
├── .agents/skills/                # Coordination skills
├── agents-docs/                   # System documentation
│   ├── coordination/              # Handoff logs, blockers, swarm configs
│   ├── agents/                    # Agent specifications
│   └── handoffs/                  # Handoff templates
├── temp/                          # State, reports, analysis docs (gitignored)
│   ├── analysis-*.md              # Swarm analysis results
│   └── research-*.md              # Web research results
├── scripts/                       # CLI tools
│   ├── cli/                       # Modular CLI implementation
│   ├── quality_gate.sh            # Quality validation
│   └── validate-codes.sh          # Code validation
├── worker/                        # Cloudflare Worker source
│   ├── lib/
│   │   ├── referral-storage/      # Referral CRUD operations
│   │   └── research-agent/        # Web research implementation
│   ├── routes/                    # API route handlers
│   ├── email/                     # Email integration
│   └── types.ts                   # ReferralInput, Research schemas
└── docs/                          # Documentation
    └── API.md                     # API documentation
```

### Root Directory Policy

**Allowed**: Standard project files only (package.json, tsconfig.json, wrangler.toml, README.md, LICENSE, VERSION, CHANGELOG.md, .gitignore).

**MUST use subfolders**: Docs → agents-docs/, Reports → temp/, Scripts → scripts/, Tests → tests/.

See [agents-docs/guard-rails.md](agents-docs/guard-rails.md) for complete rules.

## State Management

| File                                                  | Purpose                            |
| ----------------------------------------------------- | ---------------------------------- |
| `temp/state.json`                                     | Active agent status, current phase |
| `temp/skills-lock.json`                               | External skill version tracking    |
| `agents-docs/coordination/handoff-log.jsonl`          | Handoff history                    |
| `agents-docs/coordination/blockers.md`                | Escalated issues                   |
| `agents-docs/coordination/referral-swarm-config.json` | Swarm configuration                |

## Quality Gates

Always run `./scripts/quality_gate.sh` before handoff or completion:

1. TypeScript compilation
2. Unit tests (>80% coverage)
3. Validation gates
4. Security checks
5. Root directory organization

**Rule**: Silent on success, loud on failure.

## Next Steps & References

| Resource                  | Location                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| System Architecture       | [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md)                                             |
| Coordination Protocol     | [agents-docs/coordination/](agents-docs/coordination/)                                                         |
| Referral Handoff Protocol | [agents-docs/coordination/referral-handoff-protocol.md](agents-docs/coordination/referral-handoff-protocol.md) |
| Guard Rails               | [agents-docs/guard-rails.md](agents-docs/guard-rails.md)                                                       |
| Execution Plan            | [agents-docs/EXECUTION_PLAN.md](agents-docs/EXECUTION_PLAN.md)                                                 |
| Skills Directory          | [.agents/skills/](.agents/skills/)                                                                             |
| API Documentation         | [docs/API.md](docs/API.md)                                                                                     |
| Handoff Templates         | [agents-docs/handoffs/](agents-docs/handoffs/)                                                                 |
| CLI Documentation         | [temp/analysis-cli.md](temp/analysis-cli.md)                                                                   |
| Web UI/API Design         | [temp/analysis-web-ui.md](temp/analysis-web-ui.md)                                                             |
| Browser Extension Design  | [temp/analysis-extension.md](temp/analysis-extension.md)                                                       |
| Chat Bot Design           | [temp/analysis-chatbot.md](temp/analysis-chatbot.md)                                                           |
| Email Integration Design  | [temp/analysis-email.md](temp/analysis-email.md)                                                               |
| Webhook/API Design        | [temp/analysis-webhook.md](temp/analysis-webhook.md)                                                           |
| Quick Start               | [QUICKSTART.md](QUICKSTART.md)                                                                                 |
| Contributing              | [CONTRIBUTING.md](CONTRIBUTING.md)                                                                             |
| Security                  | [SECURITY.md](SECURITY.md)                                                                                     |

**Active Agents**: See `temp/state.json` for current status and assignments.
