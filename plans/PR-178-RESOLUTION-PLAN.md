# ADR & Execution Plan: Resolve PR #178 Merge + CI Failures

## Context

PR #178 (`fix/ci-invalid-shas-and-performance-17127698941190277721`) fixes GitHub Action SHA references and optimizes test performance. However:

1. **Merge Conflict**: PR shows `CONFLICTING` — `ci.yml` and `package-lock.json` differ from main
2. **Security Scan Failure**: Trivy install step fails in GitHub Actions runner
3. **CI Summary Failure**: Cascading from Security Scan failure
4. **Codacy Feedback**: Questions `maxForks` in vitest.config.ts; notes workflow file count mismatch

## Decision

We will:
1. Merge latest `origin/main` into the PR branch (resolving conflicts)
2. Fix Trivy install reliability in `ci.yml`
3. Verify vitest config validity for Vitest v4
4. Run local validation gate
5. Push and verify CI passes

## Execution Plan

### Phase 1: Merge & Resolve Conflicts
- Merge `origin/main` into the branch
- Resolve `ci.yml` conflict (security-scan job and CI summary needs)
- Resolve `package-lock.json` conflict (protobufjs override)
- Resolve `README.md` conflict (env var docs)

### Phase 2: Fix CI Issues
- **Security Scan**: Make Trivy install more reliable (use direct binary download instead of piped install script)
- **CI Summary**: Will auto-resolve once Security Scan passes

### Phase 3: Address Codacy Feedback
- Verify `maxForks` is valid config for Vitest v4 (it is: `pool: "forks"` with `maxForks: 2` is valid)
- The workflow file count mismatch is addressed — 11 workflow files have changed

### Phase 4: Validate & Push
- Run `npm run typecheck`
- Run `npm run fmt:check`
- Run `npm run validate`
- Run quality gate
- Push resolved branch to trigger fresh CI run

## Quality Gates
- [x] TypeScript compilation passes
- [x] Format check passes
- [x] Tests pass
- [x] Build passes
- [x] Quality gate passes
- [x] Merge conflicts resolved
- [x] CI run shows green

## Rollback Plan
- `git reset --hard HEAD@{1}` if merge conflicts can't be resolved
- `git push --force-with-lease` to revert if CI fails
