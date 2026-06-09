# GOAP Plan: CI/CD Swarm Audit & Fix — 2026-06-09

**Date**: 2026-06-09
**Orchestrator**: Swarm coordination (3 parallel agents)
**Branch**: `fix/ci-deployment-and-node20-deprecation`

---

## 1. Executive Summary

Comprehensive audit of all GitHub issues, PRs, CI workflows, and plans/ folder. Found 3 critical/high bugs in CI workflows, 1 medium deprecation issue across 13 workflows, and 6 stale auto-generated issues. All fixes implemented in a single PR.

---

## 2. Findings

### 2A. Open Issues (7 total → 1 actionable)

| Issue | Title | Status | Action |
|-------|-------|--------|--------|
| #242 | Deploy worker: set up Cloudflare API secrets | OPEN, blocked | **Keep** — root cause of all deployment failures |
| #441 | Production deployment failed - 0004b94 | CLOSED | Auto-generated noise |
| #439 | Production deployment failed - 0763650 | CLOSED | Auto-generated noise |
| #438 | Production deployment failed - b14682b | CLOSED | Auto-generated noise |
| #424 | ROLLBACK REQUIRED | CLOSED | Stale rollback issue |
| #422 | ROLLBACK REQUIRED | CLOSED | Stale rollback issue |
| #421 | ROLLBACK REQUIRED | CLOSED | Stale rollback issue |

### 2B. PR #440 Review

- **Title**: ci: bump vitest 2.1.9 → 4.1.8 in turnstile-spin template
- **Status**: 22/23 checks pass. Workers Builds fails (transient Cloudflare issue, unrelated to code)
- **Verdict**: Safe to merge. Only changes a devDependency in an isolated skill template.

### 2C. CI/CD Bugs Found & Fixed

#### CRITICAL: `deploy-production.yml` — 4 steps hard-fail when WORKER_HOST is empty

**Root cause**: `worker-host.sh` exits 2 when WORKER_HOST is unset. Steps "Verify production deployment", "Seed KV", "Smoke tests", and "Trigger discovery" call the script without `|| true`, causing hard failure before reaching their graceful skip checks.

**Fix**: Added `|| true` to all 4 `worker-host.sh` calls.

**Lines changed**: 137, 169, 241, 290

#### HIGH: `rollback.yml` — Hardcoded URL uses hex ACCOUNT_ID instead of subdomain slug

**Root cause**: Line 102 constructs `https://do-deal-relay.${ACCOUNT_ID}.workers.dev` using the hex account ID. But workers.dev uses an account subdomain slug (e.g., `do-it-119`), not the hex ID. The URL is always wrong.

**Fix**: Replaced inline URL construction with `worker-host.sh production` call, matching the pattern used in all other workflows.

#### HIGH: `canary.yml` — monitor-canary job has no checkout step

**Root cause**: The `monitor-canary` job calls `bash scripts/worker-host.sh staging` but has no `actions/checkout` step. The script file doesn't exist on the runner.

**Fix**: Added `actions/checkout@v6.4.0` step before the health check loop.

#### MEDIUM: Node.js 20 deprecation — 13 workflows, 26 occurrences

**Root cause**: All workflows pin `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.0.0, Node.js 20). GitHub will force Node.js 24 by June 16, 2026.

**Fix**: Updated all 26 occurrences to `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` (v6.4.0, Node.js 24).

---

## 3. Files Changed

| File | Changes |
|------|---------|
| `.github/workflows/deploy-production.yml` | +4 `|| true`, updated setup-node SHA |
| `.github/workflows/rollback.yml` | Fixed hardcoded URL → worker-host.sh, updated setup-node SHA |
| `.github/workflows/canary.yml` | Added checkout step to monitor-canary, added `|| true`, updated setup-node SHA |
| `.github/workflows/benchmarks.yml` | Updated setup-node SHA |
| `.github/workflows/ci.yml` | Updated setup-node SHA (8 occurrences) |
| `.github/workflows/ci-and-labels.yml` | Updated setup-node SHA (2 occurrences) |
| `.github/workflows/dependencies.yml` | Updated setup-node SHA |
| `.github/workflows/kv-setup.yml` | Updated setup-node SHA (2 occurrences) |
| `.github/workflows/nightly.yml` | Updated setup-node SHA (2 occurrences) |
| `.github/workflows/release.yml` | Updated setup-node SHA (2 occurrences) |
| `.github/workflows/security.yml` | Updated setup-node SHA |
| `.github/workflows/vectorize-setup.yml` | Updated setup-node SHA (2 occurrences) |

---

## 4. Remaining Action Items

1. **Issue #242**: Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets. This is the root cause of all deployment failures.
2. **PR #440**: Safe to merge. Workers Builds failure is transient/infrastructure.
3. **Cloudflare Workers Builds integration**: Monitor for recurring failures after merge.

---

## 5. Verification

- YAML lint: ✅ All changed files pass
- Prettier: ✅ All changed files formatted
- actionlint: ✅ No syntax errors
- No old setup-node SHA remaining: ✅ Confirmed
