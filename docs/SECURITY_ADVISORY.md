# Security Advisory

**Date**: 2026-05-11
**Status**: Clean

## Dependency Audit

As of May 11, 2026, `npm audit` reports **0 vulnerabilities**.

## Recent Remediations

- Previous vulnerabilities in `fast-xml-parser` and `uuid` were resolved via package overrides in `package.json`.
- Environment-level security is maintained via `security.yml` (TruffleHog for secret detection).

## Known Residual Risks

- **Vitest Worker Pool**: Occasional crashes during cleanup (handled by `scripts/run-tests-ci.sh`). No security impact identified.
- **Dependency Lag**: Some devDependencies may be outdated but do not currently pose a security risk as per `npm audit`.

## Security Recommendations

1. Continue using `npm ci` for reproducible installs and environment stability.
2. Regularly monitor `security.yml` results for any newly detected secrets.
