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
**Component**: Discovery Agent

**Issue**: Cloudflare Workers don't have DOM API, so cheerio/jsdom don't work.

**Solution**: Regex-based extraction for HTML content (referral codes, URLs, rewards).

**Prevention**: Always check Worker runtime limitations before choosing libraries. Prefer regex for simple extraction.

### LESSON-002: Zod Schema Size and Performance

**Date**: 2024-03-31
**Component**: Types/Validation

**Issue**: Full schema validation on every deal is slow with 1000+ deals.

**Solution**: Two-pass validation — quick checks first, full schema only on survivors.

### LESSON-003: KV Write Consistency

**Date**: 2024-03-31
**Component**: Storage Layer

**Issue**: KV writes are eventually consistent; immediate reads may not see the write.

**Solution**: Read-after-write verification with retry, staging→production two-phase model.

### LESSON-004: GitHub Token Security

**Date**: 2024-03-31
**Component**: GitHub Integration

**Issue**: Hardcoding tokens in code is a security risk.

**Solution**: Environment variables only. Use `wrangler secret` for production.

### LESSON-005: Agent Coordination Overhead

**Date**: 2024-03-31
**Component**: Agent Swarm System

**Issue**: Coordinating multiple agents creates documentation overhead.

**Solution**: Standardized handoff format (JSON), central state tracking (state.json), kept AGENTS.md minimal.

### LESSON-006: No Version Suffixes Until Release

**Date**: 2024-03-31
**Component**: Agent Documentation

**Issue**: Files with "-v2" suffixes created during development phase.

**Solution**: Use single canonical names. Track versions in state.json and git history, not filenames.

**Prevention**:

- **RULE**: Never use v2, v3, expand, or similar suffixes in filenames
- **RULE**: Version tracking happens in state.json and git history
- After release, use semantic versioning in git tags only

## Lessons by Category

### Storage

- KV eventual consistency requires verification
- Lock TTL must be carefully tuned (5min default)

### Discovery

- Regex-based parsing is sufficient for simple HTML
- Always respect payload limits (1MB), timeout every fetch (30s)

### Validation

- 9 gates provide defense in depth, fail fast: simple checks before complex ones

### Scoring

- Weights should sum to 1.0, quarantine is safety valve not failure

### Publishing

- Two-phase model prevents corruption, always verify after write

### Agent Coordination

- No version suffixes in filenames until release
- Parallelize by default, synthesis phase before execution

### LESSON-007: Documentation Organization

**Date**: 2024-03-31
**Component**: Project Structure

**Issue**: Documentation files cluttering root directory.

**Solution**: Created `docs/` for technical docs. Only README.md and AGENTS.md stay in root.

### LESSON-008: Starting Fresh at Version 0.1.0

**Date**: 2024-03-31
**Component**: Project Lifecycle

**Issue**: System was at 1.0.0 despite not being released.

**Solution**: Reset to 0.1.0 (alpha development). Use semantic versioning: 0.x.y for alpha/beta, 1.x.y for stable.

**Prevention**:

- **RULE**: Always start at 0.1.0 for new projects
- **RULE**: Only reach 1.0.0 after all tests pass and system is deployed

### LESSON-009: Applying Agent Coordination Templates

**Date**: 2024-03-31
**Component**: Agent Harness Engineering

**Issue**: Needed to incorporate best practices from github-template-ai-agents into do-deal-relay.

**Root Cause**: While the deal relay had basic agent coordination, it lacked the production-ready harness patterns from the template.

**Solution**:

**Applied Patterns**: VERSION file, quality_gate.sh (silent success), 8 sub-agent definitions, CLI override files (CLAUDE.md, GEMINI.md), skills structure compliance.

**Prevention**:

- **RULE**: Use VERSION file for machine-readable versioning
- **RULE**: Implement silent success / loud failure for all validation
- **RULE**: Create sub-agents for discrete, isolated tasks
- **RULE**: Keep SKILL.md under 250 lines, detailed docs in reference/
- **RULE**: Add CLI-specific overrides for multi-agent support

### LESSON-010: Guard Rail Validation Improvements

**Date**: 2026-03-31
**Component**: Guard Rails / Validation

**Issue**: WIP detection matched "template" substring instead of line-start "WIP"; branch naming missing conventional commit prefixes; schema version grep patterns incorrect.

**Solution**: Use `^` anchor for WIP patterns, add conventional commit branch prefixes (`feat/`, `fix/`, etc.), fix grep patterns for exact field matching.

**Prevention**:

- **RULE**: Always use `^` anchor for line-start patterns
- **RULE**: Validate branch names against conventional commit spec
- **RULE**: Test grep patterns with sample data before deployment

### LESSON-011: GitHub Actions Best Practices

**Date**: 2026-03-31
**Component**: CI/CD / GitHub Actions

**Issue**: Action versions using `@main` instead of pinned versions; missing `package-lock.json` handling; error masking with `|| true`.

**Solution**: Pin action versions to specific tags, handle both `npm ci` and `npm install`, use `continue-on-error: false` with explicit error handling, use secrets/env vars for URLs.

**Prevention**:

- **RULE**: Always pin action versions to specific SHAs or version tags
- **RULE**: Handle both npm ci and npm install scenarios
- **RULE**: Never use `|| true` to hide failures
- **RULE**: Use secrets/environment variables for all URLs and tokens

### LESSON-012: Cloudflare Skills Integration

**Date**: 2026-03-31
**Component**: Agent Skills / Cloudflare Integration

**Issue**: Needed to integrate 40+ Cloudflare service references for multi-agent support while maintaining clean organization.

**Solution**: Created `.claude/` and `.qwen/` agent directories with `skills.json` and `context.md`. Added `.agents/skills.lock` for dependency tracking.

**Prevention**:

- **RULE**: Use agent-specific directories for multi-agent coordination
- **RULE**: Maintain skills.lock for reproducible environments
- **RULE**: Separate skill metadata (SKILL.md) from detailed docs (reference/)

### LESSON-013: Swarm Coordination with Handoff Deployment

**Date**: 2026-03-31
**Component**: Agent Coordination / Production Deployment

**Issue**: Deployed to production using a 6-agent swarm with handoff coordination, achieving in 30 minutes what would have taken 8-12 hours sequentially.

**Solution**:

- **Phase 1 - Parallel Investigation** (3 agents): deployment-strategist, pre-deployment-tester, operations-coordinator
- **Phase 2 - Synthesis**: Consolidated findings into `temp/swarm-synthesis-report.md`
- **Phase 3 - Resolution with Handoffs** (3 agents): github-config → test-coverage (53 new tests) → deploy-prep (8 artifacts)

**Results**: 30 min vs 12+ hours. 53 tests added (259 total). 8 deployment artifacts created.

**Prevention**:

- **RULE**: Use swarm coordination for complex multi-faceted tasks
- **RULE**: Always have synthesis phase between investigation and execution
- **RULE**: Parallelize by default, sequential only when dependencies require
- **RULE**: Fresh deployment "degraded" health is expected — resolves after first deals discovered

**When to Use Swarm Coordination**:

- ✅ Complex deployment with multiple workstreams
- ✅ Testing gaps require parallel investigation
- ✅ Multiple experts needed (security, testing, operations)
- ✅ Time-critical deliverables
- ❌ Simple single-task work (overhead not worth it)
- ❌ Tight coupling between all tasks (can't parallelize)

### LESSON-014: Production KV Initialization Required

**Date**: 2026-03-31
**Component**: Deployment / KV Storage

**Issue**: All 8 API endpoints appeared to fail (503/404) on fresh deployment because production KV namespace was empty.

**Root Cause**: 3 endpoints (`/health`, `/deals`, `/deals.json`) require a production snapshot. Without it: `/health` returns 503, `/deals*` returns 404.

**Solution**: Initialize production KV with a minimal snapshot via `wrangler kv key put --namespace-id=<DEALS_PROD_ID> "snapshot:prod"`.

**Prevention**:

- **RULE**: Always initialize production KV with seed data before verifying endpoints
- **RULE**: "Degraded" health is normal on fresh deployments until first snapshot exists
- **RULE**: Test endpoints immediately after deployment, don't wait for discovery

### LESSON-015: Script Audit and Dead Code Removal

**Date**: 2026-04-01
**Component**: Scripts / Project Hygiene

**Issue**: 9 scripts in `scripts/` had zero active references in the codebase. They accumulated from various iterations (guard rails, deployment, agent CLI).

**Root Cause**: Scripts were created for specific tasks but never wired into package.json, AGENTS.md, or CI. Over time they became stale dead code.

**Deleted Scripts**: `agent-cli.sh`, `check-root-files.sh`, `dry-run.sh`, `guard-rail-audit.sh`, `init-kv-data.sh`, `install-hooks.sh`, `pre-commit-hook.sh`, `pre-push-hook.sh`, `verify-deployment.sh`

**Kept Scripts**: `quality_gate.sh` (AGENTS.md), `validate-codes.sh` (package.json), `validate-skills.sh` (quality_gate.sh), `setup-skills.sh` (manual utility)

**Issues Found During Audit**:

1. Secret detection `sk-` pattern was too broad — matched `task-decomposition` in JSON keys
2. `AGENTS.md` version was `1.0.0` while `worker/config.ts` was `0.1.0`
3. `.githooks/commit-msg` had bash syntax error (`${VAR:0:1^^}` not portable)

**Prevention**:

- **RULE**: Every script must be referenced by package.json, AGENTS.md, or a git hook to be kept
- **RULE**: Use `rg -l <script>` across codebase to verify active usage
- **RULE**: Secret detection patterns must use full regex (e.g. `ghp_[a-zA-Z0-9]{36}`) not substrings
- **RULE**: Version references must be kept in sync across config.ts, AGENTS.md, package.json

### LESSON-016: CI/CD Environment Divergence

**Date**: 2026-04-01
**Component**: CI/CD / GitHub Actions

**Issue**: Scripts that pass locally fail in CI with exit code 1, particularly quality_gate.sh and TruffleHog secret scanning.

**Root Cause**:

1. Quality gate script silent success detection different in CI (missing `set -e` error handling)
2. TruffleHog needs explicit base/head commit refs (`--since-commit`, `--branch`)
3. GitHub Actions checkout defaults to shallow clone (no full history for secret scanning)
4. Token permissions not configured for rollback notifications (`actions: write` required)
5. CodeQL requires explicit enabling in repository security settings

**Solution**:

- Add explicit `set -e` error handling in CI workflows
- Configure checkout with `fetch-depth: 0` for full history
- Add `permissions: actions: write` to workflow for notifications
- Enable CodeQL in repository security settings
- Pass explicit commit refs to TruffleHog in CI

**Applied**: Pending workflow updates

**Refs**: monitor-001, swarm-014

### LESSON-017: Release Workflow Validation Success

**Date**: 2026-04-01
**Component**: Release / Version Management

**Issue**: Needed to verify release script functionality and cross-file version synchronization.

**Root Cause**: After deleting 9 unused scripts, needed to confirm remaining release infrastructure worked correctly.

**Solution**: Version 0.1.1 successfully synchronized across 20 files using the release script. Guard rails audit logging confirmed functional. Release script works as designed.

**Results**:

- 20 files updated with synchronized version 0.1.1
- VERSION file correctly reflects release
- worker/config.ts, AGENTS.md, package.json all aligned
- Guard rails audit trail captured all changes

**Prevention**:

- **RULE**: Run release script in dry-run mode first to preview changes
- **RULE**: Always verify version synchronization across key files after release
- **RULE**: Keep release script as single source of truth for version bumps
- **RULE**: Use guard rails audit for change tracking across releases

---

## LEARNINGS Summary

### Checklist: CI/CD Best Practices

- [ ] Add `set -e` to all CI workflow shell scripts
- [ ] Configure checkout with `fetch-depth: 0` for secret scanning
- [ ] Add `permissions: actions: write` for rollback notifications
- [ ] Enable CodeQL in repository settings before first run
- [ ] Pass explicit commit refs to TruffleHog (`--since-commit`, `--branch`)
- [ ] Test quality gates in both local and CI environments
- [ ] Verify exit code handling matches between local and CI

### Quick Reference: Local vs CI Differences

| Aspect            | Local               | CI (GitHub Actions)           |
| ----------------- | ------------------- | ----------------------------- |
| Git history       | Full                | Shallow by default            |
| Error handling    | Shell default       | Needs explicit `set -e`       |
| Token permissions | User scopes         | Explicit `permissions:` block |
| Secret scanning   | Auto-detect commits | Needs explicit refs           |
| Notifications     | N/A                 | Requires `actions: write`     |

---

_Last Updated: 2026-04-01 | Total Lessons: 017_

## LESSON-018: Monolithic PR Anti-Pattern

**Date**: 2026-04-01
**Component**: GitHub / Pull Requests

**Issue**: PR #4 had 15 commits mixing bug fixes, features, skills, infrastructure. CI failures blocked entire PR. Couldn't merge valuable parts separately.

**Root Cause**:
- Mixed concerns in single PR
- Test debt in some commits blocked all others
- Merge conflicts after main branch advanced
- Skills already extracted separately caused duplication

**Solution**:
- Decompose large PRs into focused PRs by concern:
  - Bug fixes only (fix/critical-swarm-bugs)
  - Feature additions only (feat/performance-observability)
  - Infrastructure only (.gitignore, configs)
  - Documentation only
- Each focused PR should pass CI independently
- Extract value from failing PRs by cherry-picking to clean branches

**Applied**:
- PR #4 skills → PR #6 (merged cleanly)
- PR #4 bug fixes → fix/critical-swarm-bugs (PR #7)
- PR #4 features → feat/performance-observability (PR #8)

**Prevention**: 
- Create focused PRs from the start
- Maximum 3-5 commits per PR
- Single concern per PR

---

## LESSON-019: CI Failure Recovery Strategy

**Date**: 2026-04-01
**Component**: CI/CD / GitHub Actions

**Issue**: PR #4 failed 4 CI jobs (Quality Gate, Unit Tests, CI Summary, CodeQL). Valuable work was trapped in failing PR.

**Root Cause**: 
- Pre-existing test failures unrelated to PR changes
- CI environment differences from local
- Monolithic PR meant all-or-nothing merge

**Solution** - 6-Step Recovery:
1. **Analyze**: What's valuable vs what's broken
2. **Extract**: Create clean branches for valuable parts
3. **Cherry-pick**: Move good commits to clean history
4. **Test**: Verify extracted parts pass CI
5. **Close**: Document closure with extraction references
6. **Merge**: Focused PRs pass CI and merge cleanly

**Applied**:
- Analyzed PR #4 commits (temp/pr-4-analysis.md)
- Extracted 3 clean branches from messy PR
- All 3 extractions pass quality gates
- Closed PR #4 with comprehensive documentation

**Prevention**:
- Don't force-merge failing PRs
- Use git cherry-pick to salvage good commits
- Create extraction branches early when PR goes red
- Document extractions for team visibility

---

## Checklist: PR Management

- [ ] Decompose PRs by concern (bugs, features, infra, docs)
- [ ] Maximum 3-5 commits per PR
- [ ] Extract value from failing PRs rather than force-merge
- [ ] Use git cherry-pick to salvage good commits
- [ ] Create focused PRs that pass CI independently
- [ ] Document PR closures with extraction references
- [ ] Update LESSONS.md with PR process insights

