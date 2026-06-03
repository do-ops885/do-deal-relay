# GOAP Execution Plan: Fix Pre-existing CI Failures

**Date**: 2026-06-03
**Status**: ✅ COMPLETED
**Goal**: Fix E2E Tests and Smoke Tests failures blocking PR #396
**Strategy**: Sequential (single atomic fix across one file)

---

## Phase 1: Task Analysis

**Primary Goal**: All CI checks pass on PR #396 (no warnings, no failures)
**Constraints**: Single file change (`.github/workflows/ci.yml`), low risk
**Complexity**: Simple

### Root Causes Identified

| # | Failure | Root Cause | Fix |
|---|---------|-----------|-----|
| 1 | E2E Tests | `validateConfig()` requires `EMAIL_WEBHOOK_SECRET` (config-utils.ts:37) but CI workflow only passes `WEBHOOK_SECRET` and `API_ENCRYPTION_KEY` to `wrangler dev` | Add `EMAIL_WEBHOOK_SECRET` to both `--var` flags and `.dev.vars` writes |
| 2 | Smoke Tests | Same root cause — worker crashes at startup with `Missing required config: EMAIL_WEBHOOK_SECRET`, returns `{ error: 'Configuration error' }` instead of healthy response | Same fix as #1 |

---

## Phase 2: Task Decomposition

### Sub-Goals
1. **Add EMAIL_WEBHOOK_SECRET to CI workflow** - Priority: P0, Deps: none
   - E2E Tests job: add to `.dev.vars` write and `--var` flags (lines ~149-158)
   - Smoke Tests job: add to `.dev.vars` write and `--var` flags (lines ~213-220)

2. **Update learnings documentation** - Priority: P1, Deps: Sub-Goal 1
   - Add to `plans/FOLLOWUP-issues-not-addressed.md` as resolved
   - Update `AGENTS.md` lessons learned table

---

## Phase 3: Strategy Selection

**Strategy**: Sequential
- Single file change, no parallelism needed
- Verify fix passes locally before committing

---

## Phase 4: Execution Plan

### Step 1: Fix `.github/workflows/ci.yml`
- Add `EMAIL_WEBHOOK_SECRET=ci_email_webhook_test_secret` to `.dev.vars` writes
- Add `--var EMAIL_WEBHOOK_SECRET:ci_email_webhook_test_secret` to `wrangler dev` commands
- Affects: E2E Tests job + Smoke Tests job

### Step 2: Verify
- Run `npm run typecheck` (should pass — no TS changes)
- Run `npm test` (should pass — no code changes)
- Run smoke tests locally (should pass with the env var)

### Step 3: Commit & Push
- Single atomic commit with descriptive message
- Push to trigger CI

### Step 4: Monitor CI
- Watch E2E Tests, Smoke Tests, CI Summary
- All should now pass

---

## Quality Gates

1. ✅ TypeScript compilation passes
2. ✅ All unit tests pass
3. ✅ Smoke tests pass locally
4. ✅ CI workflow YAML is valid
5. ✅ All CI checks pass on PR
