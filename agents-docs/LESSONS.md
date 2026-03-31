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

### LESSON-008: Starting Fresh at Version 0.1.0

**Date**: 2024-03-31
**Component**: Project Lifecycle

**Issue**: System was prematurely at version 1.0.0 despite not being released.

**Root Cause**: Versioned as 1.0.0 during initial implementation, but system hadn't passed tests or validation.

**Solution**:

- Reset to version 0.1.0 (alpha development)
- Updated package.json, state.json, README
- Added clear alpha status documentation
- Set phase back to "bootstrap" from "test-and-validate"

**Prevention**:

- **RULE**: Always start at 0.1.0 for new projects
- **RULE**: Only reach 1.0.0 after all tests pass and system is deployed
- **RULE**: Use semantic versioning: 0.x.y for alpha/beta, 1.x.y for stable
- **RULE**: Update version in all files simultaneously

**Semantic Versioning Guide**:

- 0.1.0 - Initial development, alpha
- 0.x.0 - Beta releases, pre-stable
- 1.0.0 - First stable release
- x.y.z - Major.Minor.Patch

**Files to Update on Version Change**:

- package.json - Main version field
- agents-docs/coordination/state.json - version field
- README.md - Version badge/status
- AGENTS.md - Version references

### LESSON-009: Applying Agent Coordination Templates

**Date**: 2024-03-31
**Component**: Agent Harness Engineering

**Issue**: Needed to incorporate best practices from github-template-ai-agents into do-deal-relay.

**Root Cause**: While the deal relay had basic agent coordination, it lacked the production-ready harness patterns from the template.

**Solution**:

Applied 5 key patterns from the template:

1. **VERSION file** - Single source of truth for version (0.1.0-alpha)
2. **Quality Gate Script** - Silent success / loud failure pattern
   - Created scripts/quality_gate.sh
   - Exit 0 silently on success, Exit 2 with full output on failure
   - Prevents context flooding with success messages
3. **Sub-Agent Definitions** - Context isolation for 8 pipeline agents
   - Created .opencode/agents/ with YAML frontmatter
   - Each agent has specific role, do/don't, return format
4. **CLI Override Files** - Multi-agent support
   - Created CLAUDE.md with tool preferences and testing requirements
   - Created GEMINI.md with context window optimizations
5. **Skills Structure Compliance** - Fixed broken reference links
   - Moved extra .md files to reference/ directories
   - Created guide.md files for each skill

**Impact**:

- AGENTS.md restructured: 112 lines → 135 lines (still under 150 limit)
- Added setup, code style, testing, security sections
- Created 8 sub-agent definitions for context isolation
- Quality gate runs silently on success (context-efficient)
- Skills now follow template structure (SKILL.md + reference/)

**Prevention**:

- **RULE**: Use VERSION file for machine-readable versioning
- **RULE**: Implement silent success / loud failure for all validation
- **RULE**: Create sub-agents for discrete, isolated tasks
- **RULE**: Keep SKILL.md under 250 lines, detailed docs in reference/
- **RULE**: Add CLI-specific overrides for multi-agent support

**When to Apply Template Patterns**:

- New projects: Apply all patterns from day 1
- Existing projects: Apply incrementally, one pattern at a time
- Always validate changes don't break existing functionality
- Use quality gates to verify implementation

## Summary of Applied Patterns

| Pattern               | Status     | Files Changed    |
| --------------------- | ---------- | ---------------- |
| VERSION file          | ✅ Applied | 1 new            |
| quality_gate.sh       | ✅ Applied | 2 new            |
| Sub-agent definitions | ✅ Applied | 8 new            |
| CLI override files    | ✅ Applied | 2 new            |
| Skills compliance     | ✅ Applied | 5 skills updated |
| AGENTS.md restructure | ✅ Applied | 1 modified       |
