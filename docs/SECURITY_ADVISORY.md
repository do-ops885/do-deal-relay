# Security Advisory

**Date**: 2026-06-18
**Status**: 1 dep-CVE pending

## Dependency Audit

As of 2026-06-18, the audit toolchain flags 1 outstanding CVE-grade finding
on a transitive runtime dependency (see Pending Remediations below). The
project's own code is clean.

## Pending Remediations

The following upstream-dep CVEs are tracked here. The fix direction is to
upgrade the patched package via lockfile regen in a Linux-native environment
— local `npm install --package-lock-only` on win32 fails with `EBADPLATFORM`
(`@rolldown/binding-linux-x64-gnu` is an os:linux-tagged optional native
binding that `npm` cannot skip during lockfile resolution on Windows).

### Remediation recipe

Run on a Linux box (GitHub Codespace, WSL, admin box, or self-hosted runner):

  1. Edit `package.json#overrides.*` to the patched version pinned below.
  2. `npm ci`
  3. `npm install --package-lock-only --os=linux`
  4. Commit both `package.json` and `package-lock.json` as an isolated PR
     titled `security/bump-<pkg>-<newversion>` straight to `main`.
  5. **Move the entry from this Pending Remediations section into the
     Changelog section below in the SAME PR**. Recent Remediations
     remains the broader security-experiences log; CVE closures should
     land in Changelog for structured auditability.

### Open

- **ws CVE-2026-48779** (HIGH, memory-exhaustion DoS via tiny fragments).
  Current pin: `package.json#overrides.ws = "8.20.1"`.
  Patch: `8.21.0`.
  Reachable at runtime via `engine.io-client` 6.6.5.
  Tracked since: 2026-06-18.

## Recent Remediations

- Previous vulnerabilities in `fast-xml-parser` and `uuid` were resolved via package overrides in `package.json`.
- Environment-level security is maintained via `security.yml` (TruffleHog for secret detection).

## Changelog

Closed CVEs. Each entry corresponds to a Pending Remediations bullet moved
here via the loop-closure convention on the recipe (step 5). Entry format:

- `YYYY-MM-DD -- <CVE-ID> -- <package> -- <patched-version> -- <PR-link>`

No entries yet.

## Known Residual Risks

- **Vitest Worker Pool**: Occasional crashes during cleanup. No security impact identified.
- **Dependency Lag**: Some devDependencies may be outdated but do not currently pose a security risk as per `npm audit`.

## Security Recommendations

1. Continue using `npm ci` for reproducible installs and environment stability.
2. Regularly monitor `security.yml` results for any newly detected secrets.
