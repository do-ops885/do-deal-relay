# Swarm PR Stabilization — Issue Register

Generated: 2026-05-15

## PR Triage Results

| PR # | Title | Author | Priority | Score | Mergeable | CI Status | Draft | Files | +/− |
|------|-------|--------|----------|-------|-----------|-----------|-------|-------|-----|
| 225 | Add Dependabot configuration validation and tests | do-ops885 | **P0** | **9** | CONFLICTING | ACTION_REQUIRED | No | 51 | +2397/−4599 |
| 206 | chore(deps): bump artillery 2.0.30→2.0.31 | dependabot | P1 | 4 | UNKNOWN | 7 failures | No | 2 | +736/−1450 |
| 220 | ci: bump actions/github-script 7.1.0→9.0.0 | dependabot | P1 | 4 | UNKNOWN | 5 failures | No | 5 | +8/−8 |
| 219 | ci: bump actions/stale 9.1.0→10.2.0 | dependabot | P1 | 4 | UNKNOWN | 5 failures | No | 1 | +1/−1 |
| 223 | ci: bump actions/upload-artifact 4.6.2→7.0.1 | dependabot | P1 | 4 | UNKNOWN | 4 failures | No | 2 | +4/−4 |
| 216 | ci: bump pre-commit-hooks v5.0.0→6.0.0 | dependabot | P1 | 3 | UNKNOWN | 5 failures | No | 1 | +1/−1 |
| 210 | chore(deps): bump @playwright/test 1.59.1→1.60.0 | dependabot | P1 | 3 | UNKNOWN | 5 failures | No | 2 | +13/−43 |
| 208 | chore(deps): bump protobufjs 8.2.1→8.3.0 | dependabot | P1 | 3 | UNKNOWN | 5 failures | No | 2 | +7/−36 |

## Scoring Breakdown

### PR #225 (Score: 9 → P0)
- CONFLICTING merge state: +4
- CI ACTION_REQUIRED: +3
- Large diff (+2397/−4599 across 51 files): +2
- Cross-PR overlap with 5 other PRs: +1
- Codacy review raised 2 critical + 1 high issues: +1
- **Total: 11 → P0**

### Dependabot PRs (Score: 3-4 → P1)
- CI failures (null context — likely expected checks never ran): +3
- Overlap on workflow files (#220/#219/#223): +1
- Overlap on package.json (#206/#208/#210): +1

## Cross-PR File Overlaps

| File | Conflicting PRs | Action Required |
|------|----------------|-----------------|
| package.json | 225, 210, 208, 206 | Sequence: fix 225 first, then rebase others |
| package-lock.json | 225, 210, 208, 206 | Sequence: fix 225 first, then rebase others |
| .github/workflows/ci.yml | 225, 223 | Sequence |
| .github/workflows/nightly.yml | 225, 223 | Sequence |
| .github/workflows/deploy-production.yml | 225, 220 | Sequence |
| .github/workflows/deploy-staging.yml | 225, 220 | Sequence |
| .github/workflows/release.yml | 225, 220 | Sequence |
| .github/workflows/rollback.yml | 225, 220 | Sequence |
| .github/workflows/cleanup.yml | 220, 219 | Sequence |
