# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.8] - 2026-07-03

### Added
- **Authentication & User Management API documentation** (PR #532): Documented `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`, `PUT /api/auth/me`, and `GET /api/admin/users` in `docs/API.md`.
- **JWT Authentication support documentation**: Added documentation for JWT Bearer token authentication in the API reference.

### Changed
- **Extension UX Enhancements** (PR #530): Implemented a deferred validation pattern for manual referral code input in the browser extension. Errors are now shown only after 4+ characters or when the input loses focus (`blur`).
- **Documentation synchronization**: Synchronized version references to 0.1.8 across `README.md` and `docs/API.md`.

## [0.1.7] - 2026-06-15

### Added
- **Reward extraction tests** (PR #472): 6 unit tests verifying cash, percent, credit, EUR, comma-separated, and decimal reward extraction

### Changed
- **Security hardening** (PR #469): Structured logging, file splits, type safety improvements
- **Extract routing logic** (PR #468): Extracted routing and scheduled logic from `worker/index.ts` into dedicated modules
- **Debug logging** (PR #471): Added `logger.debug()` to 4 bare catch blocks in `resources.ts` and `state-machine.ts`, removed dead constants from `discover.ts`

### Fixed
- **API key auth in smoke tests** (PR #467): Added API key authentication to smoke tests and CI curl commands
- **Critical reward extraction bug** (PR #472): Removed `g` flag from `rewardPattern` regex in `discover-parsers.ts` that caused `.match()` to return full match strings instead of capture groups, completely breaking reward extraction (reward_value was always 0, reward_type always "credit")
- **Dead imports removed** (PR #472): Cleaned up 4 unused imports from `state-machine.ts` (ErrorClass, calculateValidationRatio, calculateSourceDiversity, rollbackSnapshot)
- **Regex consistency** (PR #473): Removed unnecessary `g` flag from `urlPattern` regex in `discover-parsers.ts` for consistency with the rewardPattern fix

## [0.1.6] - 2026-05-17

### Added
- **API Documentation Completion**: Documented previously internal endpoints for semantic search, cached research retrieval, and advanced D1 query operations (similar, recommended, trending)
- **Configuration Parity**: Synchronized README.md and DEPLOYMENT.md with source-mandatory environment variables (JWT secrets, Email webhooks) and Vectorize setup instructions
- **API Documentation Update**: Documented missing endpoints for similarity search, deal explanation, referral reactivation, and administrative key management
- **Validation API Docs**: Added comprehensive documentation for URL and batch validation endpoints
- **CI benchmark job**: Pipeline benchmark runs on release with 5,000 deals/sec threshold enforcement, report artifact upload, and performance summary in release notes
- **verify-deployment job**: 8-endpoint health check on staging before production deploy (`scripts/verify-deployment.sh`)
- **Consolidated KV seeding script**: `scripts/seed-local-kv.sh` with `--local/--remote/--e2e-only/--verify-only` modes
- **Auto-generate evals.json from skill content**: `scripts/generate_evals.py` with drift warnings when workflow patterns change
- **CI eval freshness check**: `scripts/check-evals-freshness.sh` validates evals are up-to-date against skill content
- **Guard Rail 10 (pre-commit)**: Auto-regenerates and auto-stages evals.json when skill content changes
- **Guard Rail 6 (pre-commit)**: Prettier format check on staged `.ts/.js/.json/.yaml/.yml/.md` files
- **E2E Playwright tests**: 26/26 passing against deployed worker with auth KV seeding
- **Manual Entry UX Enhancements (ADR-002)**: Improved deal entry interface (#258)
- **EU AI Act compliance logging**: 180-day retention logging for AI system operations
- **Auto-CHANGELOG generator**: `scripts/generate-changelog.sh` for release automation
- **`.yamllint` config**: Root config resolving Prettier/yamllint comment spacing conflict (`min-spaces-from-content: 1`)
- **Observability**: Traces with `head_sampling_rate` enabled in wrangler.jsonc
- **WAF/edge security documentation**: Added to DEPLOYMENT.md (Section 12)

### Changed
- **Discover phase optimized** (P0): Parallel URL pattern fetches with concurrency limit, memoized `extractContent` with contentCache, post-batch limit truncation
- **Dedupe phase optimized** (P0): `precomputeDealKeys()` pre-computes partition/URL keys once, O(1) Map-based index lookup replacing O(n) `indexOf`, cached URL keys across all 3 passes
- **Validate phase optimized** (P0): Extracted `validateSingleDeal()` helper, 5 sync gates run in parallel via `Promise.all`, 4 async gates sequential with short-circuit on failure, `fastPathDecision` typed properly (was `any`)
- **Evals freshness cycle fixed**: `check-evals-freshness.sh` now runs Prettier on generated evals.json before diffing — breaks the format cycle permanently
- **YAML lint workflow**: Switched from inline config to `.yamllint` file
- **Multiple `as any` casts replaced**: 5 P0/P1 casts in MCP search/experience/report handlers + 2 P2 casts in stats.ts replaced with proper TypeScript types
- **TypeScript strictness**: Optional chaining, void returns, and type fixes across codebase
- **Pre-commit hook restructured**: Prettier check moved before TypeScript for faster feedback
- **Production deploy workflow**: E2E test API keys auto-seeded to production KV after each deploy
- **Benchmark script**: Dynamic VERSION import from `worker/version.ts` (was hardcoded)
- **Version bumped**: 0.1.4 → 0.1.5 → 0.1.6 across package.json, VERSION, worker/version.ts

### Fixed
- **Prettier/yamllint comment spacing conflict**: yamllint default expects 2 spaces before `#`, Prettier outputs 1 — resolved via `.yamllint` with `min-spaces-from-content: 1`
- **Evals freshness format cycle**: `generate_evals.py` produces multi-line JSON, Prettier formats to single-line — now runs Prettier after generation before diffing
- **YAML lint**: 4 workflow files with comment spacing and line-length issues fixed
- **Auth KV key bug**: `wrangler kv key put` defaults to local — added `--remote` flag for production seeding
- **Playwright version conflict**: Resolved via `@playwright/test` npm overrides (^1.60.0)
- **PRs merged**: #249 (TruffleHog fix), #250 (E2E Playwright), #251 (auth E2E), #253 (evals fix), #254 (scheduled benchmarks), #255 (auto-gen evals), #256 (CI freshness), #257 (TS strictness), #258 (manual entry), #259 (version sync), #260 (codebase audit)

### Performance
- **Benchmark**: 5,618 deals/sec at 1,000 deals (exceeds 5,000 threshold)
- **Phase bottlenecks improved**: discover (28.1%), dedupe (16.9%), validate (14.6%) — real-world gains from parallel URL fetching, O(1) dedupe, and parallel sync gates

## [0.1.5] - 2026-05-17

### Added
- **Benchmark analysis**: v0.1.6 sprint plan with P0-P3 improvement roadmap (5,618 deals/sec baseline)
- **E2E test API key seeding**: CI step in deploy-production.yml for production KV
- **Comprehensive Codebase Health Audit (#260)**: Jules audit report with actionable improvements

### Changed
- **Version bumped**: 0.1.4 → 0.1.5
- **Production deploy**: Deployed with auth-verified worker (version 46e48872) — Playwright E2E 26/26 all passing

### Fixed
- **Auth KV key**: Remote KV namespace seeded with 3 test API keys (admin, user, expired) using `--remote` flag
- **PRs merged**: #220 (github-script v9 + cache sorting), #223 (upload-artifact v7)

## [0.1.4] - 2026-05-16

### Added
- **Adaptive per-source budgets**: Budget allocation based on trust score bonus, validation success rate (±50%/25%/−25%), and discovery maturity (+10–20%)
- **Benchmark reporting**: Comprehensive pipeline benchmark with multi-deal-size simulation, phase breakdown bar charts, bottleneck detection, and performance recommendations (`scripts/benchmark_pipeline.ts`)

### Changed
- **Stronger dedupe pre-partitioning**: Deals now partitioned by domain + reward type + value tier before semantic dedup, reducing O(n²) comparison scope (perf: ~2x improvement for large batches)
- **Reduced scoring metadata churn**: For-of loops instead of index-based access, pre-allocated arrays, in-place metadata mutation in scoring hot loops
- **CI/CD**: Removed `--legacy-peer-deps` from all 11 workflow files; cache cleanup now sorts by `last_accessed_at` correctly; rollback.yml uses `context.payload` to prevent template injection

### Fixed
- **cache sorting logic inversion** (cleanup.yml): Was sorting ascending (oldest first) then deleting — now sorts descending (newest first) to correctly keep 5 most recent caches
- **template literal injection security** (rollback.yml): Changed `${{ github.event.inputs.* }}` to `context.payload.inputs.*`
- **package.json version sync**: Fixed mismatch between package.json (0.1.3) and VERSION file (0.1.4)
- **PR #220**: actions/github-script v9.0.0 bump with cache sorting + rollback security fixes (merged)
- **PR #223**: actions/upload-artifact v7.0.1 bump verified and merged

### Performance
- Dedupe pipeline: Stronger pre-partitioning measured at ~5,600–5,750 deals/sec for batch sizes 500–1000
- Scoring pipeline: Metadata churn reduced via in-place mutation and pre-allocated arrays
- Discover pipeline: Adaptive budgets reduce wasted discovery cycles on low-trust sources

## [0.2.0] - 2026-03-15

### Fixed
- **kv-setup.yml**: Boolean comparison bug (`== true` → `== 'true'`) preventing manual KV namespace creation
- **deploy-production.yml**: Boolean comparison bug blocking manual production deployments
- **deploy-production.yml**: Staging health check logic inverted (was skipped on main branch pushes)
- **deploy-production.yml**: Failure notification steps never fired due to `continue-on-error: true` on preceding steps
- **deploy-staging.yml**: Missing `await` on `github.rest.issues.create()` causing incomplete issue creation
- **security.yml**: Summary check ineffective due to `continue-on-error: true` on secret-scan job
- **cleanup.yml**: Cache cleanup deleted newest caches instead of oldest (missing sort by `last_accessed_at`)
- **ci.yml** & **security.yml**: TruffleHog `file://.` protocol replaced with correct `.` path
- **yaml-lint.yml**: Linting non-YAML files in `.github/` directory (now targets `.github/workflows/`)
- **auto-merge.yml**: jq string interpolation with `[bot]` replaced with `--arg` for safe handling
- **dependencies.yml**: `jq` failing on empty/invalid `outdated.json` when no packages are outdated
- GitHub Actions workflows using non-existent action versions (checkout@v5, setup-python@v6)
- yaml-lint.yml using unstable actionlint version tag
- ci-and-labels.yml using deprecated actions-rust-lang action
- gh-labels-creator.sh interactive prompt blocking CI execution
- Inconsistent branch references between workflow files
- Documentation inconsistencies across multiple files

### Changed
- Standardized action versions to stable releases (checkout@v4, setup-python@v5)
- Replaced deprecated rust-toolchain action with dtolnay/rust-toolchain@stable
- Added --ci flag support to gh-labels-creator.sh for non-interactive CI runs
- Updated README.md version badge to 0.2.0
- Updated all documentation to reference Qwen Code support
- Improved CONTRIBUTING.md with comprehensive guide
- Cleaned up AGENTS_REGISTRY.md formatting

### Added
- `permissions` blocks to all workflows without explicit permissions (kv-setup, discovery, ci-and-labels, dependencies, ci)
- develop branch support in ci-and-labels.yml workflow
- .qwen/skills/ symlinks for Qwen Code support
- .github/dependabot.yml with 2026 best practices:
  - GitHub Actions weekly updates (grouped)
  - Docker weekly updates (exclude pre-releases)
  - Terraform monthly updates (grouped providers)
  - Docker Compose and pre-commit monthly updates
- Dependabot security updates auto-merge support
- OpenCode agent format documentation in SUB-AGENTS.md
- Supported AI Agents table in HARNESS.md

## [0.1.0] - 2026-03-14

### Added
- Initial template release
- Core skills:
  - `task-decomposition` - Break complex tasks into atomic goals
  - `code-quality` - Code review and quality checks
  - `test-runner` - Execute and manage tests
  - `shell-script-quality` - ShellCheck + BATS for shell scripts
  - `parallel-execution` - Coordinate parallel agent execution
  - `iterative-refinement` - Progressive improvement loops
  - `agent-coordination` - Multi-agent orchestration
  - `goap-agent` - Goal-oriented action planning
  - `web-search-researcher` - Web research and synthesis
- Sub-agents:
  - `goap-agent` - Complex planning & coordination
  - `loop-agent` - Iterative refinement workflows
  - `analysis-swarm` - Multi-perspective code analysis
  - `agent-creator` - Scaffold new sub-agent definitions
- Scripts:
  - `setup-skills.sh` - Create symlinks for CLI tools
  - `validate-skills.sh` - Validate skill symlinks
  - `quality_gate.sh` - Multi-language quality gate
  - `pre-commit-hook.sh` - Git pre-commit integration
  - `gh-labels-creator.sh` - Initialize GitHub labels
- Documentation:
  - `AGENTS.md` - Single source of truth
  - `agents-docs/HARNESS.md` - Harness engineering overview
  - `agents-docs/SKILLS.md` - Skill authoring guide
  - `agents-docs/SUB-AGENTS.md` - Context isolation patterns
  - `agents-docs/HOOKS.md` - Hook configuration
  - `agents-docs/CONTEXT.md` - Context engineering & back-pressure
- CLI support:
  - Claude Code (`.claude/`)
  - Gemini CLI (`.gemini/`)
  - OpenCode (`.opencode/`)

### Changed
- Skills use canonical source in `.agents/skills/` with symlinks
- Quality gate exits with code 2 to surface errors to agent
- Progressive disclosure for skills (load on demand)

[Unreleased]: https://github.com/do-ops885/do-deal-relay/compare/v0.1.8...HEAD
[0.1.8]: https://github.com/do-ops885/do-deal-relay/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/do-ops885/do-deal-relay/compare/v0.1.6...v0.1.7
[0.2.0]: https://github.com/do-ops885/do-deal-relay/compare/v0.1.0...v0.2.0
[0.1.6]: https://github.com/do-ops885/do-deal-relay/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/do-ops885/do-deal-relay/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/do-ops885/do-deal-relay/compare/v0.1.3...v0.1.4
[0.1.0]: https://github.com/do-ops885/do-deal-relay/releases/tag/v0.1.0
