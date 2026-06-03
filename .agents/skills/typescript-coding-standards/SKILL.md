---
name: typescript-coding-standards
description: Repo-specific TypeScript workflow rules, CI-safety guidelines, and hot-file coordination for do-deal-relay. Use when modifying configuration, endpoints, or frequently contested core files.
license: MIT
---

# TypeScript Coding Standards

Ensure TypeScript changes in `do-deal-relay` remain CI-safe, test-consistent, and compatible with existing validation / deployment workflows.

## Rules

### 1. `validateConfig()` Contract Changes
When adding a required environment variable to `validateConfig()`:
- Update all GitHub Action workflows that invoke `wrangler dev` (e.g., E2E and smoke test jobs).
- Update staging and production deployment workflows if they rely on the same configuration path.
- Verify local development, E2E, and smoke test assumptions before pushing.

### 2. Endpoint Response Format Changes
When changing the format or content type for endpoints (e.g., `/metrics`):
- Update all associated test files: unit, integration, E2E, and smoke tests.
- Explicitly verify content-type assertions and body-shape assertions in the test suite.

### 3. Shared Hot Files Protocol
The following files are frequently modified and require explicit coordination to avoid merge conflicts and regressions:

| File | Why it's hot |
|------|-------------|
| `worker/config.ts` | Required env vars, validateConfig contract — touched by every env change |
| `worker/index.ts` | Route registration — all new endpoints modify this |
| `worker/lib/security.ts` | Auth/RBAC — parallel changes cause hard-to-debug regressions |
| `worker/routes/referrals.ts` | High PR conflict history (see LEARNINGS.md 2026-05-20) |
| `worker/lib/research-agent/fetcher.ts` | AI Gateway integration — config + fetch strategy coupled |

**Protocol:**
- Inspect recent history for the file before editing.
- Check open PRs for overlapping changes.
- Avoid parallel edits where file ownership overlaps.

### 4. Minimal Change Principle
- Prefer incremental edits over large refactors.
- Avoid speculative rewrites.
- Preserve existing gate architecture unless the task explicitly mandates changes.

## Rationalizations

| Concern | Counter-Argument |
|---------|-----------------|
| "Strict protocol slows down development." | Coordination on hot files prevents costly merge conflict resolution and CI failures. |
| "Minimal changes limit modernization." | Incremental improvements are safer and easier to verify in a complex pipeline. |

## Red Flags

- [ ] Modifying `worker/config.ts` without checking CI workflow impacts.
- [ ] Changing endpoint output without updating E2E expectations.
- [ ] Starting parallel work on security-critical files without coordination.
