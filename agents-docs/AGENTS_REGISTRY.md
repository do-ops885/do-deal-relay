# Agents Registry

Centralized registry of all sub-agents and skills.

## Skills (Local)

| Skill | Location | Description |
|-------|----------|-------------|
| [`agent-coordination`](../.agents/skills/agent-coordination/) | `.agents/skills/` | Multi-agent orchestration patterns |
| [`github-readme`](../.agents/skills/github-readme/) | `.agents/skills/` | Create human-focused README.md files |
| [`goap-agent`](../.agents/skills/goap-agent/) | `.agents/skills/` | Goal-Oriented Action Planning |
| [`iterative-refinement`](../.agents/skills/iterative-refinement/) | `.agents/skills/` | Iterative code improvement patterns |
| [`parallel-execution`](../.agents/skills/parallel-execution/) | `.agents/skills/` | Parallel task execution patterns |
| [`skill-creator`](../.agents/skills/skill-creator/) | `.agents/skills/` | Create new skills with proper structure |
| [`task-decomposition`](../.agents/skills/task-decomposition/) | `.agents/skills/` | Break complex tasks into manageable steps |
| [`web-doc-resolver`](../.agents/skills/web-doc-resolver/) | `.agents/skills/` | Cost-effective web research (free sources first) |
| [`web-search-researcher`](../.agents/skills/web-search-researcher/) | `.agents/skills/` | Deep web search when needed |
| [`evals`](../.agents/skills/evals/) | `.agents/skills/` | Skill evaluation framework |
| [`skill-evaluator`](../.agents/skills/skill-evaluator/) | `.agents/skills/` | Reusable skill evaluation |

## Skills (External)

| Skill | Location | Description |
|-------|----------|-------------|
| `cloudflare` | Cloudflare | Workers, KV, D1, R2, Workers AI |
| `agents-sdk` | Cloudflare | Agents SDK for stateful agents |
| `durable-objects` | Cloudflare | Durable Objects patterns |
| `wrangler` | Cloudflare | Wrangler CLI usage |
| `workers-best-practices` | Cloudflare | Production Workers patterns |
| `building-mcp-server-on-cloudflare` | Cloudflare | MCP server implementation |

## Pipeline Agents

Located in `agents-docs/agents/`:

- `bootstrap-agent` - Repository setup (complete)
- `storage-agent` - KV storage layer (complete)
- `discovery-agent` - Deal discovery (complete)
- `data-agent` - Data processing (complete)
- `scoring-agent` - Deal scoring (complete)
- `publish-agent` - Deal publishing (complete)
- `notify-agent` - Notifications (complete)
- `system-validation-agent` - System validation (complete)

## New Feature Agents (Implemented)

- `mcp-server-agent` - MCP Server implementation (2025-11-25 spec) (complete)
- `d1-integration-agent` - D1 Database with FTS5 search (complete)
- `real-research-agent` - Real API integrations (ProductHunt, GitHub, HN, Reddit) (complete)
- `expiration-automation-agent` - Deal validation & expiration automation (complete)

See individual files in `agents-docs/agents/` for full specs.

## Feature Capabilities

| Feature | Status | Agent | Documentation |
|---------|--------|-------|---------------|
| MCP Server | ✅ Complete | mcp-server-agent | `/mcp` endpoints |
| D1 Database | ✅ Complete | d1-integration-agent | `/api/d1/*` endpoints |
| Real Web Research | ✅ Complete | real-research-agent | Research agent APIs |
| Expiration Automation | ✅ Complete | expiration-automation-agent | Scheduled validation |
| Full-Text Search | ✅ Complete | d1-integration-agent | FTS5 via D1 |
| Web Research (Cost-Effective) | ✅ Available | web-doc-resolver skill | Free sources first |
