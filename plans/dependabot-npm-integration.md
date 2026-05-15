# ADR: Dependabot npm Integration

**status**: active
**owner**: jules
**scope**: .github/dependabot.yml, package.json
**method**: GOAP (Analyze → Decompose → Strategize → Coordinate → Execute → Synthesize)

---

## 1) Task Analysis

**Primary Goal**: Add the `npm` ecosystem to the Dependabot configuration to automate updates for production and development dependencies.

**Context**:
Currently, `.github/dependabot.yml` manages `github-actions`, `docker`, `terraform`, `docker-compose`, and `pre-commit`, but lacks `npm`. This results in:
- Production dependencies (`protobufjs`, `zod`) not receiving automated security patches.
- Dev dependencies (`vitest`, `wrangler`, `typescript`, etc.) not being updated.
- Reliance on manual `npm audit`, which only catches known vulnerabilities, not version drift.

**Constraints**:
- Weekly updates (Mondays at 09:00 UTC).
- Limit of 5 open PRs to prevent flooding.
- Grouping for Cloudflare and testing packages to reduce noise.
- Ignore alpha, beta, and RC versions.

---

## 2) Decomposition (Sub-goals)

1. **Configure npm ecosystem in Dependabot**: Add the `npm` entry with the specified schedule, limits, labels, and groups.
2. **Verify Configuration**: Ensure the YAML syntax is valid and adheres to the repository's standards.
3. **Verify Pipeline Integrity**: Run the full test suite and quality gates to ensure no regressions.

---

## 3) Strategy Selection

**Strategy**: Sequential
- Update configuration, verify, and then run full system checks.

---

## 4) Execution Plan

### Phase 1: Configuration
- [ ] Add `npm` entry to `.github/dependabot.yml`.
- [ ] Group `@cloudflare/*`, `wrangler`, `miniflare` into `cloudflare`.
- [ ] Group `vitest`, `@vitest/*`, `playwright`, `@playwright/*`, `artillery` into `testing`.

### Phase 2: Verification
- [ ] Run `npm run test:ci`.
- [ ] Run `./scripts/quality_gate.sh`.

---

## 5) Success Metrics

- Dependabot correctly identifies the `npm` ecosystem (verified by GitHub UI post-merge, though we can only verify the config file here).
- Quality gate passes (YAML validation).
- No regressions in the existing test suite.
