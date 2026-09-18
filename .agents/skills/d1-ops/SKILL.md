---
name: d1-ops
description: Operate D1 migrations across local, preview, and production databases. Use when migrations fail locally, when e2e D1 setup breaks, when applying runtime migrations to a live database, or when D1-backed routes return MIGRATION_PENDING or missing-table errors.
---

# D1 Ops Skill — Migration Operations Runbook

## Purpose
Distilled from Wave A1/B (2026-09-17): local miniflare `exec()` newline
splitting, legacy-schema migration incompatibilities, and the first
production D1 migration to v12. Single reference for diagnosing and
executing D1 migration work without guessing.

Reference: `worker/lib/d1/migrations/`, `plans/ADR-031-deal-alerts.md`

## Dual-Write Pattern

Every schema change ships twice, in lockstep:

1. Raw SQL `migrations/NNNN_name.sql` (wrangler-native path).
2. Runtime `version: N` entry in `worker/lib/d1/migrations/schema-part-*.ts`
   (worker `initDatabase` path via `POST /api/d1/migrations?action=init`).

Both must agree on table shapes. Raw SQL 0003+0004 predate several
runtime versions — never assume the live schema matches the latest
runtime expectation. Inspect first (`PRAGMA table_info`, row counts).

## Local Dev Quirk (miniflare/workerd)

Local `D1Database.exec()` splits input on line breaks, so multi-line
single statements fail with `incomplete input: SQLITE_ERROR`. All exec
input must go through `normalizeExecSql()` (`worker/lib/d1/factory.ts`):
trim, strip comments outside string literals, flatten newlines to
spaces, guarantee a trailing semicolon. `D1Client.raw()` already
applies it — never call `db.exec()` with raw multi-line SQL directly.

Repro: `npx wrangler dev --port 8788` + admin JWT from
`tests/e2e/generate-jwt.mjs` + `GET /api/d1/migrations` (expect 200,
not 500) and `POST /api/nlq/saved` (expect 201, not 503).

## E2E D1 Rules

- `tests/e2e/setup-auth.sh` must FAIL LOUDLY when D1 init does not
  report `"success": true` (silent init gaps hide missing coverage).
- Specs carry zero hardcoded secrets: admin calls reuse the admin JWT
  at `tests/e2e/.jwt-token` (skip when absent), register/login uses a
  random per-run password. Seeded `ddr_*` test keys live only in
  `setup-auth.sh` (hashes) — never duplicate their plaintext into specs.

## Production Migration Runbook

Free-tier safe (migration writes are hundreds of rows against the
100k/day budget). Production writes still need explicit owner approval.

1. **Backup**: `npx wrangler d1 export <db> --remote --output
   /tmp/prod-backup-<date>.sql`. Verify table list in the dump. Never
   commit backups.
2. **Dump runtime SQL**: import `MIGRATIONS` from
   `worker/lib/d1/migrations/schema.ts` (tsx works) to one file per
   version. Review every file for `DROP`/`ALTER`/`INSERT...SELECT`.
3. **Compatibility check per version** against live remote schema:
   `sqlite_master` DDL + row counts. Empty sources make copy-step
   skips safe; non-empty sources require column-by-column mapping.
   Known traps: v4 `idx_audit_resource` needs v7's rebuilt `audit_log`
   (apply after v7); v7's audit copy and users-backfill assume shapes
   the 0003 bootstrap does not have (skip only when sources are
   verified empty); `role_permissions` 0004 seeds are preserved by
   `IF NOT EXISTS` no-ops (code does not read that shape).
4. **Apply in version order** via `wrangler d1 execute --remote
   --file` (multi-statement supported). Retry transient infra errors
   (`D1_RESET_DO`) after a pause; on deterministic SQL errors, split
   the version and defer only the failing statement with a recorded
   reason.
5. **Record + verify each version**: `INSERT INTO schema_migrations`
   immediately after its statements succeed — the worker runner must
   see the version as applied or it will re-run (v7's `ALTER RENAME`
   is not re-runnable). Final check: versions 1..N present,
   expected tables exist, seed rows preserved.

## Verification

- Local: `/api/d1/migrations` status shows `12/12` (or current
  `latestVersion`), saved-query roundtrip 201 + 200.
- Remote: `SELECT version FROM schema_migrations`, table inventory,
  seed counts unchanged.
- Gates: `npx tsc --noEmit`, `npm run test:unit`,
  `./scripts/quality_gate.sh` exit 0, `npm run lint:md`.

## Rationalizations
- "The migration is IF NOT EXISTS, so it is safe to re-run blindly" — renames, copies, and index builds inside the same version are not idempotent; record versions and verify each step.
- "Local D1 behaves like production D1" — miniflare exec splits on newlines; always normalize and always repro locally before touching remote.
- "E2E passed, so D1 init must have worked" — setup echoes init output; assert `"success": true` or the suite proves nothing about D1.
- "The fallback test key is fine" — unseeded fallback keys 401 in CI; reuse the provisioned admin JWT or a freshly registered user instead.

## Red Flags
- Applying a migration version remotely without a fresh export backup in `/tmp` (never in the repo).
- Recording a `schema_migrations` row for a version whose statements did not all succeed.
- Committing backups, `.jwt-token` files, or any credential literals (even `e2e-test-*` outside the sanctioned fixtures).
- Editing `VERSION` or version strings anywhere except the root `VERSION` file.
- Skipping the per-version compatibility check when the target DB was bootstrapped by a different migration system.
