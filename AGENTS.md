# AGENTS.md - Master Coordination Hub

**Goal**: Autonomous deal discovery with coordinated multi-agent CLI systems  
**Version**: 0.2.0  
**Architecture**: Agent-First CLI with swarm coordination + Referral Management System  
**Status**: Active Development - Referral System Implemented

## Quick Start

```bash
npm install                    # Install dependencies
./scripts/quality_gate.sh      # Validate all systems
npm run test:ci                # Run test suite
npm run dev                    # Start development

# CLI Tool for Referral Management
npx ts-node scripts/refcli.ts --help
npx ts-node scripts/refcli.ts auth login --endpoint http://localhost:8787
npx ts-node scripts/refcli.ts codes add --code ABC123 --url https://example.com/invite/ABC123 --domain example.com
npx ts-node scripts/refcli.ts codes deactivate ABC123 --reason expired
```

## Recent Updates: Referral Management System (v1.0.0)

### New Features

- **Multi-Input Referral System**: CLI, API, Browser Extension, Chat Bot, Email, Webhooks
- **Web Research Agent**: Automatically discovers referral codes from ProductHunt, GitHub, HN, Reddit
- **Swarm Coordination**: Parallel agent execution with handoff protocol
- **Code Lifecycle Management**: Add, activate, deactivate, reactivate with reason tracking
- **Comprehensive Storage**: KV-based with indices for code, domain, status

### New Components

| Component        | Location                                                | Purpose                          |
| ---------------- | ------------------------------------------------------- | -------------------------------- |
| Referral Types   | `worker/types.ts`                                       | ReferralInput, Research schemas  |
| Referral Storage | `worker/lib/referral-storage.ts`                        | CRUD, search, deactivate         |
| Research Agent   | `worker/lib/research-agent.ts`                          | Web discovery of codes           |
| API Endpoints    | `worker/index.ts`                                       | REST API for referral management |
| CLI Tool         | `scripts/refcli.ts`                                     | Command-line interface           |
| Swarm Config     | `agents-docs/coordination/referral-swarm-config.json`   | Agent orchestration              |
| Handoff Protocol | `agents-docs/coordination/referral-handoff-protocol.md` | Coordination rules               |

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
| **Browser Extension** | 📋 Designed             | `temp/analysis-extension.md` | MV3, auto-detect, context menu            |
| **Chat Bot**          | 📋 Designed             | `temp/analysis-chatbot.md`   | Telegram/Discord, slash commands          |
| **Email Integration** | 📋 Designed             | `temp/analysis-email.md`     | Forward parsing, command emails           |
| **Webhook/API**       | 📋 Designed             | `temp/analysis-webhook.md`   | HMAC signed, bidirectional sync           |

**Recommendation**: Start with CLI + API (implemented), then add Extension (highest ROI), followed by Chat Bot.

## Handoff Coordination Protocol

**Trigger Conditions**: Context limit, agent switch, task completion, parallel need.

**Handoff Steps**:

1. Current agent writes `temp/handoff-*.md` with: task status (done/partial/blocked), key decisions, next steps, relevant file paths
2. Update `agents-docs/coordination/handoff-log.jsonl`
3. Next agent reads handoff file + AGENTS.md + its own spec
4. Confirm understanding before proceeding

**Blocker Escalation**: 30min stuck → Escalate to `agents-docs/coordination/blockers.md` with issue, attempted fixes, relevant code, hypothesis.

**Referral-Specific Handoffs**: See [agents-docs/coordination/referral-handoff-protocol.md](agents-docs/coordination/referral-handoff-protocol.md)

See [agents-docs/coordination/](agents-docs/coordination/) for full protocol.

## Swarm Coordination Patterns

**Pattern 1: Research Swarm** (Gemini + Qwen) - Delegate web research tasks, aggregate in `temp/swarm-research-*.md`.

**Pattern 2: Validation Pipeline** (Claude + Qwen) - Run all 9 gates in parallel, aggregate results, fail fast.

**Pattern 3: Code Review Swarm** (Claude + Gemini) - Split by module (worker/, tests/, scripts/), each agent reviews + reports, consolidate findings.

**Pattern 4: Referral Management Swarm** (All agents) - See `agents-docs/coordination/referral-swarm-config.json`

- Parallel: 6 interface agents (CLI, API, Extension, Bot, Email, Webhook)
- Sequential: Ingestion → Research → Validation → Deactivation → Synthesis
- Quality Gates: Schema validation, duplicate check, trust score

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

**Research Agent**: `worker/lib/research-agent.ts` - Multi-source discovery, confidence scoring, result storage.

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
│   └── refcli.ts                  # Referral management CLI
├── worker/                        # Cloudflare Worker source
│   ├── lib/
│   │   ├── referral-storage.ts    # Referral CRUD operations
│   │   └── research-agent.ts      # Web research implementation
│   ├── types.ts                   # ReferralInput, Research schemas
│   └── index.ts                   # API endpoints
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
