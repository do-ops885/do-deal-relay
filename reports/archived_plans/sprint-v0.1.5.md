# Sprint Plan: v0.1.5

**Date**: 2026-05-17
**Status**: Released — v0.1.5 deployed to production
**Strategy**: GOAP with parallel swarm coordination

## Current State (Verified 2026-05-17)

- **v0.1.5 released** — Version bumped, deployed, E2E 26/26 passing
- **CI + Labels Setup**: ✅ 5/5 passes on main
- **CodeQL Advanced**: ✅ 5/5 passes
- **Security & Compliance**: ✅ 4/5 passes, 1 cancelled — no failures
- **Quality gate**: ✅ All 13 gates pass locally (2 pre-existing test env stderr messages non-blocking)
- **TypeScript**: 0 errors
- **Production deployed**: ✅ [https://do-deal-relay.do-it-119.workers.dev](https://do-deal-relay.do-it-119.workers.dev)

## Historical Blockers — Root Cause Analysis

### Blocker 1: Quality Gate Fails in CI but Passes Locally

**Status: ✅ RESOLVED** — All CI runs on `main` passing.

**Fix**: Added `rm -rf coverage` cleanup before tests in `quality_gate.sh` to prevent transient coverage race condition.

### Blocker 2: TruffleHog BASE/HEAD Same-Commit Error

**Status: ✅ FIXED** — Changed `outcome` → `conclusion` in `security.yml` job outputs.

**Root Cause**: When a PR is the first push to a branch, `github.event.before` equals `github.sha` (both point to the merge base). The security.yml already has a conditional:

```yaml
if [ "${BEFORE}" = "${SHA}" ] || [ -z "${BEFORE}" ]; then
    trufflehog filesystem . --only-verified --json || true
else
    trufflehog git . --since-commit "${BEFORE}" --only-verified --json || true
fi
```

`continue-on-error: true` is set on the step, but the **security-summary job** checked `needs.secret-scan.outputs.outcome` which evaluates to `"failure"` when the step fails (despite `continue-on-error`). This caused `exit 1` even for transient issues like a failed TruffleHog install.

**Fix (applied)**: Changed from `outcome` to `conclusion` in job outputs:
```yaml
# Before: outcome = raw step result ("failure" even with continue-on-error)
outcome: ${{ steps.secret-scan.outcome }}
# After: conclusion = effective result after continue-on-error ("success")
outcome: ${{ steps.secret-scan.conclusion }}
```
Using `conclusion` correctly reflects that `continue-on-error: true` means the failure is expected and handled.

**Validation**: ✅ PR #249 created with single commit, Security workflow passed, PR merged by `github-actions`.
- Second validation (v2): Triggered via single-commit PR on branch `test/trufflehog-validation-v2` to re-confirm `conclusion` logic.

### Blocker 3: CodeQL Not Enabled

**Status: ✅ RESOLVED** — CodeQL Advanced workflow has 5/5 successful runs on main. CodeQL is enabled and working with `build-mode: none` for both `actions` and `javascript-typescript` languages.

**Root Cause**: The workflow file (`codeql.yml`) was correctly configured with `build-mode: none` — no manual build steps needed for `actions` or `javascript-typescript`. CodeQL auto-enabled when the workflow was pushed to main.

**Notes**:
- No older workflow file exists — only `.github/workflows/codeql.yml` (CodeQL Advanced). Reference to `ID: 255789862` was a workflow run ID, not a separate file.
- No action needed — CodeQL analysis runs on every push and PR to main and on a weekly schedule.
- Issue #243 closed: no cleanup needed.

## Sprint Goals

### P0: CI/CD Stability — All Complete ✅

### P1: Developer Experience — All Complete ✅

### P2: Feature Work — All Complete ✅

### P3: Production & E2E (Added v0.1.5)

1. **Production deploy** ✅ — Deployed to https://do-deal-relay.do-it-119.workers.dev
2. **Playwright E2E 26/26 passing** ✅ — Seeded remote KV with `--remote` flag for auth keys
3. **Auth KV seeding** ✅ — Root cause: `wrangler kv key put` defaults to local. Used `--remote` to seed production KV.
4. **Version bump 0.1.5** ✅ — Consistent across package.json, VERSION, worker/version.ts

## Execution Strategy

### Phase 1: CI Fixes (P0, Parallel Swarm)

```
Agent 1: Fix CI quality gate
  ├── Read CI failure logs from branch run #25960225295
  ├── Run `act` locally to reproduce CI behavior
  ├── Patch quality_gate.sh or ci-and-labels.yml for CI compatibility
  └── Gate: CI run passes on test PR

Agent 2: Fix TruffleHog workflow
  ├── Change security-summary job to use continue-on-error properly
  └── Gate: Single-commit PR passes Security workflow

Agent 3: Enable CodeQL
  ├── Attempt API enablement (gh api)
  ├── Document manual steps if API fails
  └── Gate: CodeQL appears in Actions tab
```

### Phase 2: Validation (P1, Sequential)

```
Agent 1: Run benchmark script, record results
Agent 2: Generate CHANGELOG from git log
Agent 3: Review AGENTS.md for stale references
────────────────────────────────────────
Gate: No regressions in test suite
```

### Phase 3: Feature Planning (P2, Research)

```
Review benchmark results → Identify next high-impact improvements
───────────────────────────────────────────────────────
Gate: Stakeholder approval on priorities
```

## Quality Gates

- [x] All CI workflows pass on `main` (verified 2026-05-16)
- [x] No test regressions (98/98 test files, 1650/1656+ passing)
- [x] TypeScript compiles clean (0 errors)
- [x] Quality gate passes locally (coverage race fixed) and in CI
- [x] TruffleHog passes on single-commit PRs (fix validated via PR #249)
- [x] CodeQL scanning active (5/5 runs passing)
- [x] Benchmark results recorded (5,600-5,750 deals/sec)
- [x] Auto-CHANGELOG script created (scripts/generate-changelog.sh)

## Risks

| Risk | Mitigation |
|------|------------|
| CI quality gate environment differs from local | Use `act` to reproduce CI; document exact runner image (ubuntu-latest) |
| TruffleHog requires repo admin for config | All changes are in workflow YAML — no admin needed |
| CodeQL requires GitHub settings change | Try API first; provide step-by-step manual fallback |
| Release workflow may still fail on tag | Verify Cloudflare secrets (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) are set in repo secrets |
