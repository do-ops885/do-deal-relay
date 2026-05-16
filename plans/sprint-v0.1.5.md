# Sprint Plan: v0.1.5

**Date**: 2026-05-16
**Status**: Planning
**Strategy**: GOAP with parallel swarm coordination

## Current State

- **v0.1.4 released** — All PRs merged, all open issues closed, tag v0.1.4 pushed
- **CI workflows**: CI + Labels Setup passes on `main`; failed runs were on a branch (`jules/overnight-audit-*`)
- **Release workflow**: Failed 5 times consecutively — all due to missing Cloudflare secrets in fork (expected)
- **All quality gates pass locally** — TypeScript 0 errors, 98/98 test files passing, formatting clean

## Historical Blockers — Root Cause Analysis

### Blocker 1: Quality Gate Fails in CI but Passes Locally

**Root Cause**: The `ci-and-labels.yml` quality-gate job runs `./scripts/quality_gate.sh` with `SKIP_TESTS=true`. The script runs:
1. `npm run lint` → `tsc --noEmit && prettier --check .`
2. `npm run validate` → `scripts/validate-codes.sh`
3. `npm run build` → `scripts/generate-version.sh && tsc`
4. Prettier format check (already covered by lint)
5. YAML validation (yamllint)
6. GitHub Actions workflow validation (actionlint)
7. Secret detection (grep patterns)
8. npm audit
9. Dependabot validation
10. Skill symlinks check

**Likely failure points**:
- `prettier --check .` checks ALL files globally — CI may have extra files or different git state
- `validate-codes.sh` may require environment-specific binaries not in CI PATH
- `npm run build` generates version files that may differ between local and CI environments
- YAML/actionlint tools (`yamllint`, `actionlint`) may not be installed in CI runner

**Fix Strategy**:
- [ ] Run `act` (GitHub Actions local runner) to reproduce CI environment exactly
- [ ] Or: Capture CI failure logs from the branch runs to pinpoint exact gate failure
- [ ] Or: Incrementally add `|| true` fallbacks to the CI workflow for non-critical checks, matching the script's behavior
- [ ] Validate: Trigger CI run on a test PR after fix

### Blocker 2: TruffleHog BASE/HEAD Same-Commit Error

**Root Cause**: When a PR is the first push to a branch, `github.event.before` equals `github.sha` (both point to the merge base). The security.yml already has a conditional:

```yaml
if [ "${BEFORE}" = "${SHA}" ] || [ -z "${BEFORE}" ]; then
    trufflehog filesystem . --only-verified --json || true
else
    trufflehog git . --since-commit "${BEFORE}" --only-verified --json || true
fi
```

**However**, `continue-on-error: true` is set on the step, so TruffleHog itself shouldn't fail the workflow. The actual failure is likely in the **security-summary job** which checks `needs.secret-scan.result` and exits with `exit 1` if the result is `failure`.

**Fix Strategy**:
- [ ] Change security-summary to check `needs.secret-scan.outputs.outcome` (the step output) instead of `needs.secret-scan.result` (the job result)
- [ ] Or: Remove the `exit 1` from security-summary when secret scan is the only failure
- [ ] Or: Set `continue-on-error: true` on the secret-scan job-level (not just step-level) so the job reports success
- [ ] Validate: Create test PR with single commit, verify TruffleHog scan passes

### Blocker 3: CodeQL Not Enabled

**Root Cause**: CodeQL requires enabling in GitHub repository settings under "Code security and analysis". The workflow file (`codeql.yml`) is correctly configured, but the repository-level setting blocks execution.

**Fix Strategy**:
- [ ] Navigate to: GitHub repo → Settings → Code security & analysis → CodeQL → Enable
- [ ] Or: Use GitHub API: `gh api -X PUT /repos/do-ops885/do-deal-relay/code-scanning/default-setup -f state=configured`
- [ ] Or: Push the workflow to `main` — some repos auto-enable via push detection
- [ ] Validate: CodeQL run appears in Actions tab after enabling

## Sprint Goals

### P0: CI/CD Stability

1. **[Fix CI quality gate](blob:fix-ci-quality-gate)** — Debug and fix `quality_gate.sh` in CI environment
2. **[Fix TruffleHog workflow](blob:fix-trufflehog)** — Prevent single-commit pushes from failing CI
3. **[Enable CodeQL](blob:enable-codeql)** — Enable GitHub CodeQL scanning in repo settings

### P1: Developer Experience

4. **Auto-generate CHANGELOG** — Script to extract conventional commits into changelog entries
5. **Review AGENTS.md** — Clean up stale references, update with v0.1.4 changes

### P2: Feature Work

6. **Browser tests** — Complete pending browser-agent work from coordination state
7. **Evaluate next enhancements** — Based on benchmark data from v0.1.4

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

- [ ] All CI workflows pass on `main` and PR branches
- [ ] No test regressions (98/98 test files, 1650/1656+ passing)
- [ ] TypeScript compiles clean (0 errors)
- [ ] Quality gate passes locally AND in CI
- [ ] TruffleHog passes on single-commit PRs
- [ ] CodeQL scanning active
- [ ] Benchmark results recorded

## Risks

| Risk | Mitigation |
|------|------------|
| CI quality gate environment differs from local | Use `act` to reproduce CI; document exact runner image (ubuntu-latest) |
| TruffleHog requires repo admin for config | All changes are in workflow YAML — no admin needed |
| CodeQL requires GitHub settings change | Try API first; provide step-by-step manual fallback |
| Release workflow may still fail on tag | Verify Cloudflare secrets (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) are set in repo secrets |
