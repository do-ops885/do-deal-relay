# ADR-2026-05-10: GitHub Workflow Modernization (2026 Baseline)

- **Status**: Accepted
- **Date**: 2026-05-10
- **Decision Makers**: AI agent (GOAP execution)

## Context
The repository had multiple GitHub Actions workflow quality issues and gaps:
- Invalid cross-job context usage in `security.yml` (`steps.*` referenced in another job).
- Inconsistent workflow hardening and run efficiency patterns.
- Lack of explicit GOAP/ADR traceability for CI/CD governance.

## Decision
Adopt a 2026 baseline for workflows with these immediate changes:
1. Fix invalid context references and use `needs.<job>.result` for cross-job status checks.
2. Add least-privilege `permissions` to security workflows.
3. Add path-based scoping to heavy security workflows to reduce unnecessary execution.
4. Keep action versions on current stable major releases already used in-repo.

## Consequences
### Positive
- Eliminates a concrete runtime error in security summary reporting.
- Improves security posture with explicit minimum token permissions.
- Reduces compute usage and latency on non-code PR changes.

### Tradeoffs
- Path filters can skip some scheduled/manual checks on docs-only changes (intentional optimization).
- Further improvements (OIDC deployments, SLSA provenance, full pinned SHAs) can be phased later.

## Follow-up
- Evaluate reusable workflow extraction for duplicated Node setup/install blocks.
- Evaluate pinned commit SHAs for third-party actions where governance requires immutable references.
