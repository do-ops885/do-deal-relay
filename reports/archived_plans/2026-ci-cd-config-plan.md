# 2026 CI/CD Configuration Plan — Tests, Build, Lint, Docs

**Date**: 2026-05-11
**Project**: do-deal-relay (Cloudflare Workers, TypeScript)
**Status**: Proposed

---

## 1. Current State Analysis

### What Exists
- **CI Pipeline** (`ci.yml`): 6 jobs — quality-gate, test, validate-codes, security-scan, lint, build-check, smoke-test
- **Security Pipeline** (`security.yml`): secret-scan, dependency-check, daily scheduled run
- **Label Setup** (`ci-and-labels.yml`): multi-language detection (Node/Rust/Python/Go)
- **Deploy Workflows**: deploy-staging.yml, deploy-production.yml, canary.yml, rollback.yml
- **Other**: auto-merge.yml, dependencies.yml, release.yml, cleanup.yml, discovery.yml, yaml-lint.yml
- **Scripts**: quality_gate.sh, run-tests-ci.sh, validate-codes.sh, pre-commit-hook.sh, pre-push-hook.sh
- **Pre-commit**: pre-commit-hooks, prettier, tsc, vitest
- **Package.json scripts**: dev, deploy, build, test, test:ci, test:smoke, test:e2e, test:load:\*, lint, validate, format

### Identified Issues (2026 Best Practice Gaps)

| Area | Current | 2026 Best Practice |
|------|---------|-------------------|
| **Node versions** | Mix of Node 22 and 24 across workflows | Pin to single LTS version (22), use matrix for compatibility |
| **Package manager** | `npm ci --legacy-peer-deps` everywhere | Use `--legacy-peer-deps` consistently or migrate lock |
| **Job dependencies** | Most jobs run in parallel with no `needs:` | Lint → Test → Build → Deploy chain with fail-fast |
| **Concurrency** | Only some workflows have it | All PR workflows should cancel-in-progress |
| **Permissions** | `contents: read` not always set at workflow level | Principle of least-privilege per job, restrict GITHUB_TOKEN |
| **Action pinning** | Using `@v4` tags | Pin to full SHA for supply-chain security |
| **Test sharding** | Single-worker vitest | Matrix sharding for parallel test execution |
| **Coverage** | Only uploads on main push | Upload on every PR, merge coverage reports |
| **E2E tests** | Playwright configured but not in CI | Add E2E job to CI pipeline |
| **Docs build** | No docs validation workflow | Build and validate docs on PR |
| **Workflow consolidation** | 15 separate workflow files | Consolidate overlapping checks |
| **Package.json scripts** | Not following 2026 npm conventions | Reorganize per package.json conventions spec |
| **Type checking** | `tsc --noEmit` as lint | Separate `typecheck` script |
| **Local check script** | None for local dev | Add `check.sh` or `verify.sh` for local pre-push |
| **Pre-commit overhead** | Runs full vitest on every commit | Too slow — should only lint/format |
| **Nightly tests** | No scheduled full test suite | Add nightly integration test run |

---

## 2. Recommended Configuration Changes

### 2.1 package.json Scripts (2026 npm Conventions)

Per the 2026 ESLint package.json conventions:
- Script names MUST use lowercase, `:` to separate parts, `-` to separate words
- Scripts MUST appear in alphabetical order
- `lint` MUST run all lint checks; `lint:fix` must not auto-fix unless explicitly called
- `test` MUST run all tests; should NOT include linting
- `test` SHOULD report coverage when possible

**Proposed scripts (alphabetical):**

```json
"scripts": {
  "build": "bash scripts/generate-version.sh && tsc",
  "build:watch": "bash scripts/generate-version.sh && tsc --watch",
  "deploy": "wrangler deploy",
  "dev": "bash scripts/generate-version.sh && wrangler dev",
  "fmt:check": "prettier --check .",
  "fmt:fix": "prettier --write .",
  "lint": "tsc --noEmit && prettier --check .",
  "lint:fix": "tsc --noEmit && prettier --write .",
  "test": "vitest run --coverage",
  "test:ci": "vitest run --pool=forks --no-file-parallelism --coverage",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:load:all": "npm run test:load:api && npm run test:load:webhook && npm run test:load:kv",
  "test:load:api": "artillery run -t ${WORKER_URL:-http://localhost:8787} tests/load/artillery/api-endpoints.yml",
  "test:load:kv": "artillery run -t ${WORKER_URL:-http://localhost:8787} tests/load/artillery/kv-storage.yml",
  "test:load:quick": "artillery run -t ${WORKER_URL:-http://localhost:8787} --overrides '{\"config\":{\"phases\":[{\"duration\":30,\"arrivalRate\":5}]}}' tests/load/artillery/api-endpoints.yml",
  "test:load:smoke": "artillery run -t http://localhost:8787 --overrides '{\"config\":{\"phases\":[{\"duration\":10,\"arrivalRate\":1}],\"ensure\":{\"p95\":500,\"maxErrorRate\":5}}}' tests/load/artillery/api-endpoints.yml",
  "test:load:webhook": "artillery run -t ${WORKER_URL:-http://localhost:8787} tests/load/artillery/webhook.yml",
  "test:smoke": "vitest run tests/smoke/endpoints.test.ts",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "validate": "bash scripts/validate-codes.sh",
  "verify": "bash scripts/quality_gate.sh"
}
```

**Key changes:**
- Add `typecheck` as separate script (CI calls independently)
- Add `fmt:check` and `fmt:fix` following 2026 conventions
- Rename `lint` to include both typecheck + format check
- Add `lint:fix` for auto-fix capability
- Add `test:watch` for local dev
- Add `verify` as umbrella command for pre-push
- Sort alphabetically

### 2.2 CI Workflow — Consolidated (`ci.yml`)

**2026 Best Practice Structure:**

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "9"

jobs:
  # ── Stage 1: Fast quality gates (run in parallel) ──
  lint:
    name: Lint
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run typecheck

  format:
    name: Format Check
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run fmt:check

  docs:
    name: Docs Build
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run build  # Ensures JSDoc/TS doc comments compile
      # Add markdown lint if docs/ folder exists
      - name: Validate markdown
        run: npx markdownlint --config markdownlint.toml "docs/**/*.md" "README.md" "AGENTS.md"
        continue-on-error: true

  # ── Stage 2: Tests (run after lint passes) ──
  test:
    name: Unit Tests
    needs: [lint]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run test:ci -- --shard=${{ matrix.shard }}/3
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.shard }}
          path: coverage/
          retention-days: 7

  test-e2e:
    name: E2E Tests
    needs: [lint]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npx playwright install --with-deps chromium
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          SKIP_DEV_SERVER: "false"
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results
          path: playwright-report/
          retention-days: 7

  smoke-test:
    name: Smoke Tests
    needs: [lint]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - name: Run dry-run build
        run: npx wrangler deploy --dry-run
      - name: Run smoke tests
        run: |
          npx wrangler dev --port 8787 &
          WRANGLER_PID=$!
          for i in {1..30}; do
            if curl -sf http://localhost:8787/health > /dev/null; then
              SUCCESS=1; break
            fi
            sleep 2
          done
          [ "${SUCCESS}" = "1" ] || { echo "Timeout"; kill $WRANGLER_PID; exit 1; }
          npm run test:smoke
          kill $WRANGLER_PID

  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Trivy filesystem scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          scan-ref: .
          severity: CRITICAL,HIGH
          exit-code: "1"
      - name: npm audit
        run: |
          npm ci --legacy-peer-deps
          npm audit --audit-level=moderate

  # ── Stage 3: Build verification ──
  build:
    name: Build
    needs: [lint, format, test]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run build
      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/
          retention-days: 7

  # ── Stage 4: Summary ──
  summary:
    name: CI Summary
    runs-on: ubuntu-latest
    needs: [lint, format, docs, test, test-e2e, smoke-test, security-scan, build]
    if: always()
    steps:
      - name: Report Status
        run: |
          echo "## CI Results" >> $GITHUB_STEP_SUMMARY
          echo "| Job | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|-----|--------|" >> $GITHUB_STEP_SUMMARY
          for job in lint format docs test test-e2e smoke-test security-scan build; do
            result="${{ needs[job].result }}"
            echo "| ${job} | ${result} |" >> $GITHUB_STEP_SUMMARY
          done
```

**Key improvements:**
1. **Fail-fast stages**: Lint → Test → Build chain. If lint fails, tests don't run.
2. **Test sharding**: Split unit tests across 3 parallel shards for faster CI.
3. **Coverage artifacts**: Upload per-shard coverage for later merging.
4. **E2E in CI**: Playwright tests now run on every PR.
5. **Docs validation**: Markdown linting + build verification on PR.
6. **Trivy integration**: Modern security scanner replacing manual grep.
7. **Consistent Node version**: Single `NODE_VERSION` env var.
8. **Timeout on every job**: Prevents runaway builds.
9. **Artifact uploads**: Build output, coverage, E2E results preserved.

### 2.3 Nightly Workflow (`nightly.yml`)

**New file for heavy/slow tests that shouldn't block PRs:**

```yaml
name: Nightly Tests
on:
  schedule:
    - cron: "0 3 * * *"  # Daily at 3 AM UTC
  workflow_dispatch:

permissions:
  contents: read

env:
  NODE_VERSION: "22"

jobs:
  full-test-suite:
    name: Full Test Suite
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run test:ci -- --coverage
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: nightly-results
          path: |
            coverage/
            playwright-report/
          retention-days: 14

  load-test:
    name: Load Test (Smoke)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci --legacy-peer-deps
      - name: Run load test smoke
        run: npm run test:load:smoke
```

### 2.4 Pre-commit Configuration

**Current issue**: Running full vitest on every commit is too slow.

**2026 Best Practice**: Pre-commit should only run fast checks (lint, format). Full tests run on push via CI.

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: check-yaml
      - id: check-json
      - id: check-toml
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-added-large-files
        args: [--maxkb=1000]
      - id: check-merge-conflict
      - id: detect-private-key
      - id: check-case-conflict

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0
    hooks:
      - id: prettier
        files: \.(js|ts|json|yaml|yml|md)$
        additional_dependencies:
          - prettier@3.2.5

  - repo: local
    hooks:
      - id: tsc
        name: TypeScript type check
        entry: npx tsc --noEmit
        language: system
        pass_filenames: false
        always_run: true
        files: \.(ts|tsx)$
```

**Removed**: vitest hook from pre-commit (too slow for local commits).

### 2.5 Local Verification Script

**New file: `scripts/verify.sh`** for local pre-push validation:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Running local verification..."
echo "================================"

echo "[1/4] Type checking..."
npm run typecheck

echo "[2/4] Format check..."
npm run fmt:check

echo "[3/4] Unit tests..."
npm run test:ci

echo "[4/4] Build check..."
npm run build

echo "================================"
echo "All checks passed!"
```

### 2.6 Workflow Consolidation Recommendations

**Keep as-is** (serves distinct purpose):
- `deploy-staging.yml` — staging deployment
- `deploy-production.yml` — production deployment with approval gates
- `canary.yml` — canary releases
- `rollback.yml` — emergency rollback
- `release.yml` — release automation
- `auto-merge.yml` — dependency auto-merge
- `dependencies.yml` — dependency management

**Consolidate/Remove**:
- `ci-and-labels.yml` → Merge label setup into `ci.yml` or run as one-time setup. The multi-language detection is unnecessary for this TypeScript-only project.
- `resolve-deepsource.yml` → Evaluate if still needed; DeepSource is being deprecated in favor of GitHub-native code scanning.
- `yaml-lint.yml` → Merge into `ci.yml` as the `docs` job (already includes markdown lint).
- `cleanup.yml` → Keep if it does resource cleanup, else merge into scheduled CI.
- `discovery.yml` → This is the scheduled deal discovery cron, keep as-is.
- `kv-setup.yml` → One-time setup, can be removed after initial setup.

---

## 3. Implementation Phases

### Phase 1: Package.json Scripts (Low Risk, High Value)
- [ ] Reorganize scripts per 2026 npm conventions
- [ ] Add `typecheck`, `fmt:check`, `fmt:fix`, `test:watch`, `verify`
- [ ] Sort alphabetically
- [ ] Test locally

### Phase 2: Pre-commit Optimization (Low Risk)
- [ ] Remove vitest from pre-commit hooks
- [ ] Update hook versions to latest
- [ ] Test commit speed locally

### Phase 3: CI Workflow Improvements (Medium Risk)
- [ ] Consolidate `ci.yml` with staged jobs
- [ ] Add test sharding
- [ ] Add E2E tests to CI
- [ ] Add docs validation
- [ ] Integrate Trivy for security scanning
- [ ] Consistent Node version across all workflows

### Phase 4: New Workflows (Medium Risk)
- [ ] Create `nightly.yml` for scheduled full test suite
- [ ] Add local `scripts/verify.sh`

### Phase 5: Workflow Cleanup (Low-Medium Risk)
- [ ] Evaluate and consolidate overlapping workflows
- [ ] Remove redundant workflows
- [ ] Update action versions to pinned SHA

---

## 4. 2026 Best Practices Checklist

| Practice | Status | Notes |
|----------|--------|-------|
| Fail-fast job dependencies | ✅ Proposed | Lint → Test → Build chain |
| Concurrency with cancel-in-progress | ⚠️ Partial | Only some workflows have it |
| Test sharding/matrix | ✅ Proposed | 3-shard parallel unit tests |
| Coverage upload on PR | ⚠️ Current: main only | Should upload every PR |
| E2E in CI | ✅ Proposed | Playwright on every PR |
| Security scanning | ⚠️ Partial | Add Trivy, keep TruffleHog |
| Action SHA pinning | ❌ Not done | Using @v4 tags |
| Timeout on all jobs | ⚠️ Partial | Some missing timeout-minutes |
| Least-privilege permissions | ⚠️ Partial | Review per-job permissions |
| Node version consistency | ❌ Not done | Mix of 22 and 24 |
| Nightly full test suite | ✅ Proposed | New workflow |
| Local verification script | ✅ Proposed | scripts/verify.sh |
| Docs validation in CI | ✅ Proposed | Markdown lint + build |
| Artifact retention | ✅ Proposed | Coverage, E2E, build output |
| Environment-based deploys | ⚠️ Need review | Check staging/prod environments |
| OIDC for cloud auth | ❌ Not done | Use for Cloudflare deploy |
| Reusable workflows | ❌ Not done | Future improvement |
| workflow_dispatch on all | ⚠️ Partial | Add to CI for manual trigger |

---

## 5. References

- [ESLint package.json Conventions](https://eslint.org/docs/latest/contribute/package-json-conventions) — 2026 npm script naming standards
- [GitHub Actions CI/CD 2026 Guide](https://jishulabs.com/blog/ci-cd-github-actions-2026) — Production pipeline patterns
- [CI/CD Pipeline Best Practices 2026](https://ztabs.co/blog/ci-cd-pipeline-best-practices) — Fail-fast stages, sharding, security
- [Node.js package.json in 2026](https://thelinuxcode.com/nodejs-packagejson-in-2026-the-contract-the-workflow-api-and-the-team-s-control-panel/) — Scripts as workflow API
- [Complete Guide to GitHub Actions](https://devopsil.com/articles/2026-03-23-complete-guide-github-actions-cicd) — Staged CI/CD patterns
