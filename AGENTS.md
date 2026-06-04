# Agent Coordination Hub - do-deal-relay

## Named Constants
Essential bounds for the repository.
See: [agents-docs/hard-constraints.md](agents-docs/hard-constraints.md)

## Development Phases (Agent Workflow)
We use a GOAP approach combined with ADRs for structured development.

1. **ANALYZE & STRATEGIZE (Phase 1)**
   - **Action**: Evaluate the problem, identify architecture requirements. Write an **ADR** in `plans/`.
   - **Instruction**: Analyze the repository before asking questions.

2. **DECOMPOSE & PLAN (Phase 2)**
   - **Action**: Break down the problem into atomic, testable tasks. Record these in a plan file under `plans/`.
   - **Instruction**: produce a written plan, wait for confirmation for non-trivial tasks. **Mandatory**: Load `plans/GOAP_STATE.md` and `plans/ACTIONS.md` before starting non-trivial planning.

3. **EXECUTE & COORDINATE (Phase 3)**
   - **Action**: Execute tasks using the atomic commit workflow.
   - **Mandatory**: Run `./scripts/quality_gate.sh` before every commit.
   - **Instruction**: Respect existing 9 validation gates.

4. **SYNTHESIZE (Phase 4)**
   - **Action**: Extract discoveries and update project-specific documentation or `agents-docs/LEARNINGS.md`.

## Session Checklist

### Before starting any task
- [ ] Load `plans/GOAP_STATE.md`
- [ ] Load `plans/ACTIONS.md`
- [ ] Review uncommitted changes with `git status --short` and `git diff HEAD`
- [ ] LOC pre-check: `find worker -name '*.ts' ! -name '*.d.ts' -exec wc -l {} + | sort -rn | head -20` — fix any file > 500 LOC before starting new work
- [ ] Check CI baseline with `gh run list --workflow=ci.yml --limit 3` (if `gh` available)

### Before claiming completion
- [ ] Run `npm run typecheck`
- [ ] Run `npm run test`
- [ ] Run `npm run lint`
- [ ] Run `./scripts/quality_gate.sh`
- [ ] Update `plans/GOAP_STATE.md`
- [ ] Update `plans/ACTIONS.md`
- [ ] Add any new regressions / prevention rules to `progress/LEARNINGS.md`

## Atomic Commit Workflow (Mandatory)
All agent-driven changes MUST use:
```bash
./scripts/ai-commit.sh --type <type> [--scope <scope>] --subject <subject> [--body <body>]
```

### Commit Types
`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Quality Gates (System Infrastructure)

The system enforces 13 quality gates via `./scripts/quality_gate.sh`:
1. TypeScript compilation
2. Unit tests
3. Validation gate orchestration check
4. Directory organization
5. Build check
6. Prettier format check
7. YAML syntax validation
8. GitHub Actions workflow validation
9. Secret detection
10. Dependency audit (`npm audit`)
11. Skill symlinks integrity
12. Git hooks installation
13. Dependabot configuration validation

## Validation Gates (Per-Deal Logic)

The system enforces 9 mandatory validation gates in the worker pipeline (`worker/validation/pipeline.ts`):
1. `schema_validation`
2. `normalization_verification`
3. `deduplication_check`
4. `source_trust`
5. `reward_plausibility`
6. `expiry_validation`
7. `second_pass_validation`
8. `idempotency_check`
9. `snapshot_hash_verification`

## Repository Structure Rules

- **Allowed in root**: Only standard config files (package.json, wrangler.jsonc, etc.).
- **Documentation**: MUST be in `docs/` or `agents-docs/`.
- **Plans/Reports**: MUST be in `plans/`, `progress/`, or `reports/`.
- **Skills**: Canonical source is `.agents/skills/`.
- **Temporary Files**: MUST be in `temp/`. Diagnostic or transient files (e.g., `typecheck_*.txt`) in the root are forbidden.

## Branch & PR Coordination

- **Shared Files Protocol**: The following files are frequently modified across branches and require explicit coordination: `worker/config.ts`, `worker/index.ts`, `worker/lib/security.ts`, `worker/routes/referrals.ts`, `worker/lib/research-agent/fetcher.ts`, `.github/workflows/*.yml`. Before modifying any of these, check active PRs to avoid merge conflicts.
- **File Ownership Check**: When running parallel agents, enumerate all files each agent will modify. If ANY file overlaps between agents, switch to sequential/hybrid execution.
- **Merge Base Strategy**: Always fetch `origin/main` before starting work and rebase onto the latest `main` before creating a PR.
- **Conflict Prevention Checklist** before creating a PR:
  - [ ] `git merge origin/main --no-commit --no-ff` to detect conflicts early
  - [ ] All 13 quality gates pass
  - [ ] TypeScript strict mode compiles with zero errors
  - [ ] No test files import deleted/removed modules
  - [ ] Function signatures match across all call sites

## Lessons Learned

Operational lessons and regression prevention rules are maintained in [progress/LEARNINGS.md](progress/LEARNINGS.md). **Every correction becomes a rule.**

## Agent Guidance
- **Minimal Clarification**: Do not ask questions that can be answered by analysis.
- **Verification**: Always use read-only tools to confirm effects.
