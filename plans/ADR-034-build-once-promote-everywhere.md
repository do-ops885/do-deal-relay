# ADR-034: Build-once-promote-everywhere

**Date**: 2026-11-01
**Status**: Accepted
**Supersedes**: ADR-015 H-3 proposal (R2 storage variant)

## Context

`npm run build` runs `scripts/generate-version.sh` and `tsc`, and every deploy
job invoked it independently:

- `.github/workflows/deploy-production.yml` — production
- `.github/workflows/canary.yml` — staging (`deploy --env staging`)
- `.github/workflows/release.yml` — staging for verification

Staging and production therefore received artifacts from two separate builds of
the same commit. `generate-version.sh` is deterministic for a given `VERSION`
(it writes only that value), so the drift risk is limited to a `VERSION` or
lockfile change between the two jobs — but nothing in the pipeline detected
that case.

## Decision

A reusable workflow, `.github/workflows/build-artifact.yml`, builds once per
commit and uploads `dist/`, `worker/version.ts`, and `build-manifest.json`
(version, sha, ref, run id, timestamp) as `worker-build-<sha>`.

Every deploy job downloads that artifact instead of rebuilding, and fails if
`build-manifest.json.sha` does not equal `github.sha`. Nested callers
(`release.yml` → `deploy-production.yml`) pass `build_artifact_name`, which
skips the inner build job and promotes the caller's artifact.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| R2 bucket (original ADR-015 H-3 text) | Promotion happens inside a single workflow run, where Actions artifacts already guarantee a single build. An R2 bucket adds a resource, credentials, and lifecycle management for no additional guarantee. |
| `wrangler versions upload` + promote | Versions are scoped to one Worker script; staging and production are different scripts (`do-deal-relay` vs `do-deal-relay-staging`), so a version cannot be promoted across environments. |
| Leave per-job builds | No cross-job equality check; drift stays silent. |

## Consequences

- Staging and production deploy byte-identical inputs from one build per
  commit; the manifest check makes a mismatch a hard failure.
- Deploy jobs still run `npm ci`: Wrangler bundles `worker/index.ts` at deploy
  time, and the artifact carries the version stamp rather than the bundle.
- Artifacts expire after 7 days; nothing depends on retention beyond the run.
- Rollback semantics are unchanged (`wrangler rollback`).

## Verification

`scripts/ci-workflow-validator.sh`, yamllint, and `prettier --check` are clean.
Behaviour inside GitHub Actions is not reproducible locally; the first canary
or release run exercises the download path.
