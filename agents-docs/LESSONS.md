# Self-Learning Lesson System

## Purpose
Track issues, solutions, and improvements encountered during development for continuous learning.

## Format
Each lesson follows this structure:
```
## LESSON-XXX: Title
- **Date**: YYYY-MM-DD
- **Component**: Which module/agent
- **Issue**: What went wrong
- **Root Cause**: Why it happened
- **Solution**: How it was fixed
- **Prevention**: How to avoid in future
```

## Active Lessons

### LESSON-001: Worker DOM Parser Unavailable
**Date**: 2024-03-31
**Component**: Discovery Agent (discover.ts)

**Issue**: Cloudflare Workers don't have DOM API, so traditional HTML parsing libraries (cheerio, jsdom) don't work.

**Root Cause**: Workers runtime is lightweight and doesn't include browser APIs like DOMParser or cheerio's dependencies.

**Solution**: Implemented regex-based extraction for HTML content. Key patterns:
- Code extraction: `/(?:referral|invite)[_-]?(?:code)?["']?\s*[:=]\s*["']?([A-Z0-9]{6,20})/gi`
- URL extraction: `/https?:\/\/[^\s"<>]+/gi`
- Reward extraction: `/(?:reward|bonus|get|earn)\s+\$?([0-9,]+)/gi`

**Prevention**: 
- Always check Worker runtime limitations before choosing libraries
- Prefer regex for simple extraction over DOM parsing
- For complex scraping, consider using external service

### LESSON-002: Zod Schema Size and Performance
**Date**: 2024-03-31
**Component**: Types/Validation

**Issue**: Full schema validation on every deal during validation phase could be slow with many deals.

**Root Cause**: Zod validates every field, every time. With 1000+ deals, this adds up.

**Solution**: 
- Keep schemas but use selective validation
- First pass: quick checks (length, format)
- Second pass: full schema validation only on survivors
- Cache validation results

**Prevention**:
- Use validation gates progressively (fail fast)
- Monitor validation performance
- Consider lighter validation for high-volume scenarios

### LESSON-003: KV Write Consistency
**Date**: 2024-03-31
**Component**: Storage Layer

**Issue**: KV writes are eventually consistent, so immediate reads may not see the write.

**Root Cause**: Cloudflare KV has eventual consistency - writes propagate globally over time.

**Solution**: 
- Implement read-after-write verification
- Retry reads with exponential backoff
- Use staging→production two-phase model
- Store critical data with verification

**Prevention**:
- Always verify writes succeeded
- Don't assume immediate consistency
- Design for eventual consistency from start

### LESSON-004: GitHub Token Security
**Date**: 2024-03-31
**Component**: GitHub Integration

**Issue**: Hardcoding or exposing GitHub tokens in code is a security risk.

**Root Cause**: Tokens in code can be leaked via git history or logs.

**Solution**:
- Use environment variables only
- Check for `GITHUB_TOKEN` env var
- Fail gracefully if not configured
- Document token setup in AGENTS.md

**Prevention**:
- Never commit tokens
- Use `wrangler secret` for production
- Validate token scope (repo access)

### LESSON-005: Agent Coordination Overhead
**Date**: 2024-03-31
**Component**: Agent Swarm System

**Issue**: Coordinating multiple agents creates documentation overhead.

**Root Cause**: Each agent needs clear specs, handoff protocols, and state tracking.

**Solution**:
- Created agents-docs/ structure
- Standardized handoff format (JSON)
- Central state tracking (state.json)
- Reduced AGENTS.md to essentials

**Prevention**:
- Keep agent specs minimal and focused
- Use templates for handoffs
- Automate state updates where possible

### LESSON-006: No Version Suffixes Until Release
**Date**: 2024-03-31
**Component**: Agent Documentation

**Issue**: Created files with "-v2" suffixes during development phase (test-agent-v2.md, validation-agent-v2.md).

**Root Cause**: Thought versioning was needed for agent iterations, but this is premature before first release.

**Solution**:
- Renamed files to remove version suffixes
- Use single canonical names (test-agent.md, validation-agent.md)
- Track versions in state.json, not filenames
- Git history tracks changes

**Prevention**:
- **RULE**: Never use v2, v3, expand, or similar suffixes in filenames
- **RULE**: Keep single canonical names until codebase is released
- **RULE**: Version tracking happens in state.json and git history
- **RULE**: After release, use semantic versioning (v1.0.0, v2.0.0) in tags/branches, not filenames

**Applies To**:
- Agent documentation files
- Module files
- Configuration files
- Any source code files

**When to Use Versions**:
- Git tags for releases
- Package.json version field
- API versioning in URLs
- State tracking in coordination files
- NOT in source filenames

## Learnings by Component

### Storage Layer
- KV eventual consistency requires verification
- Lock TTL must be carefully tuned (5min default)
- JSONL logging requires sequential keys for ordering

### Discovery
- Regex-based parsing is sufficient for simple HTML
- Always respect payload limits (1MB)
- Timeout every fetch (30s default)

### Validation
- 9 gates provide defense in depth
- Fail fast: simple checks before complex ones
- Track gate-specific failure rates

### Scoring
- Weights should sum to 1.0
- Source diversity matters for resilience
- Quarantine is safety valve, not failure

### Publishing
- Two-phase model prevents corruption
- GitHub commits provide audit trail
- Always verify after write

### Notifications
- Dedupe prevents spam
- Telegram optional, GitHub Issues mandatory
- Cooldown windows prevent alert fatigue

### Agent Coordination
- No version suffixes in filenames until release
- State.json tracks current state
- Git history tracks changes
- Use semantic versioning in tags only

## Metrics to Monitor

1. **Validation pass rate by gate** - Identify weak points
2. **Discovery yield** - Deals found per source
3. **Publish success rate** - End-to-end reliability
4. **Notification frequency** - Alert quality
5. **Pipeline duration** - Performance trends

## Improvement Ideas

- [ ] Add caching layer for frequently accessed deals
- [ ] Implement source health monitoring
- [ ] Add ML-based anomaly detection for rewards
- [ ] Create automatic source discovery (robots.txt scanning)
- [ ] Build deal quality dashboard

### LESSON-007: Documentation Organization
**Date**: 2024-03-31
**Component**: Project Structure

**Issue**: Documentation files cluttering root directory.

**Root Cause**: As documentation grew (API, Deployment, Legal), root directory became messy.

**Solution**:
- Created `docs/` folder for all technical documentation
- Moved API.md, DEPLOYMENT.md, LEGAL_COMPLIANCE.md to docs/
- Created docs/INDEX.md for navigation
- Kept AGENTS.md and README.md in root for visibility
- Updated all references

**Prevention**:
- **RULE**: All technical documentation goes in `docs/`
- **RULE**: Only README.md and AGENTS.md stay in root
- **RULE**: Create docs/INDEX.md when docs folder created
- **RULE**: Update references when moving files

## Version Suffix Rule

**CRITICAL**: Until codebase is released:
- ❌ NO: `file-v2.ts`, `agent-v2.md`, `module-expand.ts`
- ✅ YES: `file.ts`, `agent.md`, `module.ts`
- ✅ YES: Track in state.json: `"version": "in-progress"`
- ✅ YES: Use git commits for history
- ✅ YES: After release, use git tags: `v1.0.0`, `v2.0.0`

**Why**: Version suffixes in filenames create confusion, duplicate logic, and make tracking harder. Git already handles versioning perfectly.
