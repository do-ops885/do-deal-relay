# Dependency Audit Snapshot — 2026-06-18

**Branch reference:** `chore/analysis-fixes`
**Source runs:** `npm outdated --json`, `npm audit --json` (full counts captured
in this turn's `spawn_agents` baseline).

## Wide picture

| Bucket | Count |
| --- | --- |
| Total dependencies (transitive) | **705** |
| Total vulnerabilities | **28** |
| Critical | **0** |
| High | **12** |
| Moderate | **16** |
| Low / Info | **0** |
| Outdated top-level packages | **0** (every entry in `package.json` satisfies its declared range) |

> Implication: **all 28 vulns live in transitive deps** that are not pinned
> by the project's semver ranges. Patching the top-level `package.json`
> ranges will not fix them; lockfile-level remediation (a single targeted
> `npm install <pkg>@<patched>` or `npm update <pkg>` in `dependencies.yml`)
> is the right tool.

## High-severity spotlight

### `ws` (the open CVE-2026-48779 blocker)

| Where | Value |
| --- | --- |
| `package.json` `overrides.ws` | `8.20.1` |
| `package-lock.json` `node_modules/ws` resolved | `8.20.1` from `https://registry.npmjs.org/ws/-/ws-8.20.1.tgz` |
| Available patch | `8.20.3` / `8.21.0` (the override would resolve cleanly) |
| Symptom | `Security Scan` job stays RED indefinitely until the override AND the lockfile resolve to `>= 8.20.3`. |

This is the **primary PR-unblock** for chore/lint-e2e-transitions → main
(follow-up to PRs #496 / #497).

### `@cloudflare/vitest-pool-workers`

| Where | Value |
| --- | --- |
| Vulnerability carrier | `miniflare` and `wrangler` (transitive) |
| Severity scan element | High |
| Knock-on | `tests/integration/*.test.ts` use workerd; if pool-workers is unsafe the integration suite inherits the risk. |

Mitigation: pin via `overrides` block in `package.json`:

```jsonc
"overrides": {
  "ws": ">=8.20.3",
  "@cloudflare/vitest-pool-workers": "<= latest-non-vulnerable>",
  "miniflare": "<= latest-non-vulnerable>",
  "wrangler": "<= latest-non-vulnerable>"
}
```

(Drop the trailing comment entries — they're tracking markers.)

### `@artilleryio/int-core`

| Where | Value |
| --- | --- |
| Vulnerability carrier | `socket.io-client` and `ws` (transitive) |
| Severity | High |
| Knock-on | `tests/load/load-test.ts` and the production_sim scenario. |

If the `ws` override lands and a future `socket.io-client` patch propagates,
this resolves transitively.

## Moderate-severity (16)

Listed verbatim is overkill — captured in the run output as
`via: [CVE-…]`. The recommended handling is the same as above: a single
targeted lockfile-update PR after the override is bumped, not a mass-update.

## `npm outdated` result

> Every direct dependency in `package.json` is currently satisfying its
> declared range. The maintenance pattern is via `dependencies.yml`'s weekly
> `npm update` (which auto-creates `deps/weekly-updates` PRs).

## Recommended PR sequencing

1. **PR-A (this unblocks everything):** land the SECURITY_ADVISORY recipe in
   isolation. Touch `package.json` `overrides.ws` and regen the lockfile on
   Linux env; push the PR titled `fix(security): bump ws override to 8.21.0`.
   Expected: Security Scan flips green, PR #496 / #497 re-train to MERGEABLE.
2. **PR-B:** evaluate the `@cloudflare/vitest-pool-workers` advisory via the
   `npm install <pkg>@latest-non-vulnerable` path. Open only if PR-A is not
   enough.
3. **PR-C:** mass weekly update arrives naturally through
   `.github/workflows/dependencies.yml`. The 16 moderate-severity transitive
   issues should be folded into that auto-PR if they're in the update set.

## Reference

- `docs/SECURITY_ADVISORY.md` step 5 — the canonical ws regen recipe.
- Plans `ADR-011-fix-preexisting-ts-errors.md` — conflict resolution pattern
  for mixed bugs vs refactors.
