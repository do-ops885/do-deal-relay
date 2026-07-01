# GOAP Plan: Implement All Open GitHub Issues

## Task Analysis

**Primary Goal**: Implement all open GitHub issues with atomic commits, passing CI and quality gates
**Complexity**: Complex (32+ issues, multiple epics)
**Strategy**: Hybrid (parallel independent work + sequential coordination)

## Sub-Goals

### P0-P1: Already Addressed by Recent Merges (no code changes needed)
- #267 (#261,#262,#263,#264) - Fixed by #336, #330, #326
- #273 (#269 HMAC, #270 open redirect, #272 CORS) - Fixed by #325, #326
- #242 - Ops task (Cloudflare API token setup)

### P1: Code Changes Required
1. **#285** - Switch research agent to real web fetching (config + fetcher changes)
2. **#286** - CSS selector-based content extraction (new extractor with cheerio)
3. **#277** - Production monitoring & health endpoints (health check improvements)
4. **#280** - User model and auth DB schema (D1 migration)
5. **#281** - JWT/session-based authentication middleware

### P2: Code Changes Required
1. **#282** - RBAC authorization middleware
2. **#283** - User management API endpoints
3. **#287** - AI-powered content summarization
4. **#288** - Rate limiting, caching, request management for web fetching
5. **#290** - Cursor-based pagination for MCP tool results
6. **#291** - MCP progress notification support
7. **#292** - Result streaming for long-running MCP operations

### P3: Code Changes Required
1. **#298-#302** - Web UI Dashboard (layout + basic views)
2. **#294-#296** - Semantic Search (embeddings + search API)

### Rollback Issues (#337,#335,#334,#333,#332,#329,#328)
- Root cause: Cloudflare API token missing/invalid (#242)
- Code: Document resolution steps, auto-close on verification

## Execution Strategy

```
Phase A: Config + Security baseline (sequential)
Phase B: New features (parallel - 4 agents)
Phase C: Quality gates + CI fix (sequential)
Phase D: Atomic commits + PR (sequential)
```

### Phase A: Foundation (sequential)
1. Config changes for real fetching
2. SSRF allowlist for research domains
3. D1 migration for auth schema

### Phase B: Feature Implementation (parallel)
- Agent 1: Auth system (#280, #281, #282, #283)
- Agent 2: Research agent (#285, #286, #287, #288)
- Agent 3: MCP enhancements (#290, #291, #292)
- Agent 4: Monitoring + Dashboard (#277, #298-#302)

### Phase C: Quality Validation (sequential)
1. Run quality_gate.sh
2. Fix all failures
3. Run typecheck
4. Run tests

## Quality Gates
- TypeScript compilation: zero errors
- All CI checks pass
- Quality gate script exits 0
- Atomic commits per issue group
