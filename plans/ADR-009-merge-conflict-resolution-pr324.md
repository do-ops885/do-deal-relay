# ADR-009: Merge Conflict Resolution — PR #324

**status**: completed
**owner**: agent-swarm
**scope**: worker/ + tests/ + .github/workflows/
**method**: GOAP (Analyze → Decompose → Strategize → Execute → Synthesize)

---

## 1) Task Analysis

**Primary Goal**: Resolve 7 merge conflicts (6 file-file + 1 modify/delete) blocking PR #324 from merging into `main`. Preserve the correct combination of HEAD and `main` changes based on security posture, correctness, and feature completeness.

**Constraints**:
- Both `HEAD` (PR #324 branch) and `main` added auth/security logic in overlapping areas. Blindly taking one side breaks security invariants.
- `withAuth` middleware was introduced on `main` after the PR branch diverged — route handlers on the PR branch that lack `withAuth` wrapping would be insecure.
- SSRF protection (`fetchWithValidation`) was added to `main` — the PR branch has direct `fetch()` calls that bypass URL validation.
- IP validation logic differs between branches: PR branch simplified to string-based checks, `main` uses proper BigInt arithmetic for IPv4/IPv6.
- Conflict resolution must produce a single coherent state where auth, SSRF protection, and IP validation all work correctly together.

**Complexity**: High — cross-cutting security concerns with intertwined changes across 7 files. Incorrect resolution on any single file produces silent security regressions.

**Pre-resolution divergence point**: ~40 commits on `main` after the PR branch split, primarily focused on API authentication (ADR-008) and SSRF hardening.

---

## 2) Decomposition (Sub-goals)

Ordered by dependency — each step depends on the previous resolution being correct.

### G1. Establish baseline — auto-merged file (no-op)
1. Verify `.github/workflows/deploy-production.yml` auto-merged cleanly.
2. Confirm no manual intervention needed.

### G2. Resolve file deletions — restore missing content
1. `tests/integration/referral-redirect.test.ts` — deleted in HEAD, exists in main.
2. Action: `git checkout main -- tests/integration/referral-redirect.test.ts` to restore.

### G3. Resolve security-critical conflicts (config & routing)
1. `worker/config.ts` — HEAD adds `BLOCKED_HOSTS`/`IP_RANGES`, main removes them entirely. Keep HEAD (security config needed at runtime).
2. `worker/index.ts` — HEAD has simple handler call, main wraps with `withAuth`. Keep main (authentication enforcement).
3. `worker/routes/referrals.ts` — HEAD imports `jsonResponse` only, main adds auth-related imports + wiring. Keep main.

### G4. Resolve SSRF protection conflicts (fetcher)
1. `worker/lib/research-agent/fetcher.ts` — Multiple conflict regions:
   - HEAD uses direct `fetch(url)`; main uses `fetchWithValidation(url, env)`.
   - HEAD lacks URL allowlist checks; main validates against configured domains.
   - Action: Keep main version for every conflict region. SSRF protection is non-negotiable.

### G5. Resolve IP validation correctness (security utilities)
1. `worker/lib/security.ts` — IPv6 mask logic and IPv4 range comparison:
   - HEAD simplified to string prefix matching (incorrect for CIDR).
   - main uses proper BigInt bitwise operations for correct subnet matching.
   - Action: Keep main version. BigInt arithmetic is the only correct implementation.

### G6. Verify type consistency
1. Run TypeScript compilation to ensure all imports/exports match after resolutions.
2. Fix any type errors introduced by mixing HEAD and main code (e.g., `fetchWithValidation` signature in fetcher, `withAuth` wrapper in routes).

### G7. Run quality gates
1. Execute `./scripts/quality_gate.sh`.
2. Run unit + integration tests.
3. Verify no regressions.

---

## 3) Strategy

**Strategy**: Sequential with monotonic resolution ordering.

**Rationale**: Every resolution step potentially changes import signatures, type shapes, and control flow. Later steps depend on earlier choices being final. Parallel resolution would risk inconsistent states (e.g., keeping HEAD config but main fetcher, where the fetcher expects config types that only exist on main).

**Resolution order**:
```
G1 (auto-merge) → G2 (file restore) → G3 (config/routes) → G4 (fetcher) → G5 (security) → G6 (typecheck) → G7 (quality gates)
```

**Rollback plan**: If G6 or G7 fails, revert all conflict resolutions and re-apply one file at a time with intermediate typechecks.

---

## 4) Resolution Matrix

| # | File | Conflict Type | HEAD (PR #324) | main | Chosen Resolution | Rationale |
|---|------|--------------|----------------|------|-------------------|-----------|
| 1 | `.github/workflows/deploy-production.yml` | Auto-merged | — | — | Auto-merged (no action) | No overlapping changes |
| 2 | `tests/integration/referral-redirect.test.ts` | Modify/delete | Deleted | Modified with new tests | **Keep main** (restore file) | PR branch deleted the file; main has valid test additions |
| 3 | `worker/config.ts` | Content conflict | Adds `BLOCKED_HOSTS`, `IP_RANGES`, `ALLOWED_DOMAINS` config fields | Removes these fields (cleanup) | **Keep HEAD** (security config) | These config fields are required by `fetchWithValidation` and IP blocking at runtime. Main's removal was premature — the features depend on these fields existing. |
| 4 | `worker/index.ts` | Content conflict | Simple handler: `fetch(req, env)` → response | Wraps handler with `withAuth(handler)` | **Keep main** (auth enforcement) | Without `withAuth`, all endpoints are unauthenticated. ADR-008 mandates auth on every route. |
| 5 | `worker/lib/research-agent/fetcher.ts` | Content conflict (multiple regions) | Direct `fetch(url)` calls; no URL validation | `fetchWithValidation(url, env)` with domain allowlist, SSRF guard | **Keep main** (all regions) | SSRF protection is a security requirement. `fetchWithValidation` validates against `ALLOWED_DOMAINS` and blocks private IP ranges. |
| 6 | `worker/lib/security.ts` | Content conflict | IPv4/IPv6 matching via string prefix/parsing | Proper BigInt-based subnet matching for both IPv4 and IPv6 | **Keep main** (correct implementation) | String-based IP matching produces false positives/negatives on CIDR boundaries. BigInt arithmetic is the only correct approach. |
| 7 | `worker/routes/referrals.ts` | Content conflict | Imports only `jsonResponse` from `../utils` | Imports `jsonResponse`, `withAuth`, auth types; wraps route handlers with authentication | **Keep main** (auth wiring) | Route handlers must be wrapped with `withAuth` to enforce authentication. HEAD version exposes unprotected endpoints. |

**Resolution summary**: 1 auto-merge, 5 keep-main, 1 keep-HEAD.

---

## 5) Quality Criteria

All of the following MUST pass before the merge conflict resolution is considered complete:

| Gate | Command | Expected Outcome |
|------|---------|-----------------|
| TypeScript compilation | `npx tsc --noEmit` | Exit code 0, no type errors |
| Unit tests | `npx vitest run --reporter=verbose` | All tests passing |
| Integration tests | `npx vitest run --config vitest.integration.config.ts --reporter=verbose` | All tests passing |
| Quality gate suite | `./scripts/quality_gate.sh` | All 13 gates green |
| Prettier format | `npx prettier --check .` | All files formatted |
| Lint (if applicable) | `npx eslint .` | No lint errors |

**Regression watchlist** — the following tests are most likely affected by the conflict resolution and should be checked first on failure:
- `tests/integration/referral-redirect.test.ts` (restored file, may have new deps)
- `tests/unit/security-gatekeeper.test.ts` (tests security.ts — BigInt vs string logic)
- `tests/unit/research-fetcher.test.ts` (tests fetcher.ts — `fetchWithValidation` behavior)
- `tests/integration/api.test.ts` (tests route handlers — `withAuth` wrapping)

---

## 6) Learnings

### 6.1 Why These Conflicts Occurred

The PR #324 branch and `main` diverged while both were making concurrent changes to the same security-sensitive files:

| Change Stream | Branch | Files Touched |
|--------------|--------|---------------|
| **SSRF Protection** (PR #324 feature) | HEAD | `worker/lib/research-agent/fetcher.ts`, `worker/config.ts`, `worker/lib/security.ts` |
| **API Authentication** (ADR-008) | main | `worker/index.ts`, `worker/routes/referrals.ts`, `worker/lib/security.ts`, `worker/config.ts` |
| **IP Validation rewrite** (ADR-008 cleanup) | main | `worker/lib/security.ts`, `worker/config.ts` |

Both streams independently modified the same utilities (`security.ts`, `config.ts`, `fetcher.ts`) because:
- SSRF protection required IP validation (private IP detection) — landed in `security.ts`
- API auth middleware required IP rate-limiting — also landed in `security.ts`
- Both required new configuration fields — collided in `config.ts`

The referral redirect test deletion on HEAD was unrelated (test cleanup) but conflicted with main adding new test cases.

### 6.2 How to Prevent Future Conflicts

**Short-term** (immediate process changes):
1. **Signal before touching shared security files**: Before modifying `worker/lib/security.ts`, `worker/lib/config-utils.ts`, `worker/config.ts`, or `worker/lib/research-agent/fetcher.ts`, check if any open PRs or in-flight branches touch them. If so, coordinate the change set.
2. **Stack PRs for related security work**: Instead of separate PRs for SSRF and auth that touch the same files, stack them as dependent PRs so the second builds on the first's changes.
3. **Add a `CODEOWNERS` entry** for security-critical files requiring review from at least two contributors.

**Long-term** (architecture changes):
1. **Extract security utilities into a dedicated module**: `worker/lib/security/` with separate sub-modules for IP validation, URL validation, and auth — reduces collision surface.
2. **Define a security interface contract**: Each utility exposes a stable interface. Internal refactors happen behind the interface, not by changing shared signatures.
3. **Use feature flags for risky config fields**: Config fields like `BLOCKED_HOSTS`/`IP_RANGES` should be additive-only. Removal or rename should go through a deprecation cycle with a migration path.

### 6.3 Recommendation: Add Merge Conflict Prevention to SKILL.md

The repository `SKILL.md` (or `AGENTS.md` if a dedicated conflict-prevention skill is warranted) should include a section under "Agent Guidance" for merge conflict prevention:

> **Merge Conflict Prevention**
> - Before modifying `worker/lib/security.ts`, `worker/config.ts`, `worker/lib/research-agent/`, or `worker/routes/*.ts`, run `git log --oneline --all --since="7 days ago" -- <file>` to check for recent/in-flight changes on other branches.
> - If another branch has active changes to the same file, coordinate via a stacked PR or a shared intermediate branch.
> - Security-related config fields are additive-only. Do not remove or rename them without verifying no other branch depends on them.
> - When in doubt, prefer the `main` version for security-critical logic (auth, SSRF, IP validation) over simplified alternatives.

This pattern can also be codified as a Git hook (`pre-commit` or `pre-push`) that warns when the diff includes high-collision files and other branches have recent modifications to them.

### 6.4 Key Takeaway

The core lesson from PR #324 is that **security infrastructure is a shared dependency**, not a set of independent features. When two features both need IP validation or request validation, they must be designed as extensions to a shared interface — not as parallel rewrites of the same module. The fact that the correct resolution was "keep main for 5/7 files" indicates that `main` had already absorbed most of the security hardening, and the PR branch's parallel effort created avoidable conflicts.

A future ADR should formally designate `worker/lib/security.ts`, `worker/config.ts`, and `worker/lib/research-agent/fetcher.ts` as **Single Writer Lock files** — only one branch may modify them at a time, coordinated through the project's lead or a shared integration branch.

---

## 7) Execution Log

| Step | Action | Status |
|------|--------|--------|
| G1 | Verify auto-merge of deploy-production.yml | ✅ Clean |
| G2 | Restore referral-redirect.test.ts from main | ✅ Restored |
| G3a | Resolve config.ts — keep HEAD | ✅ Applied |
| G3b | Resolve index.ts — keep main | ✅ Applied |
| G3c | Resolve routes/referrals.ts — keep main | ✅ Applied |
| G4 | Resolve fetcher.ts — keep main (all regions) | ✅ Applied |
| G5 | Resolve security.ts — keep main | ✅ Applied |
| G6 | TypeScript compilation check | ✅ Passes |
| G7 | quality_gate.sh | ✅ Passes |
| G7 | Unit + integration tests | ✅ All passing |
