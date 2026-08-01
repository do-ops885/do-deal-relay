# PEV Spec — Reddit Post Lifecycle

## Task

**Title**: Reddit post publication and automatic lifecycle management
**Author**: Amp
**Date**: 2026-08-01
**Priority**: high

## Goal

Add an opt-in Reddit client that records bot-authored deal posts and deletes
them when a configured, independently verifiable expiry signal is observed.

## Approach

Use Reddit's OAuth Data API behind the repository's SSRF-safe fetch boundary,
persist lifecycle state in D1, and dispatch a dedicated 30-minute cron without
changing the existing discovery, daily, or weekly jobs.

## Non-Goals

- [x] No automatic Reddit submission from the publish pipeline.
- [x] No execution against a real Reddit account during development or tests.
- [x] No storage of commenter usernames or comment bodies.
- [x] No replacement of the existing discovery-only Reddit fetcher.
- [x] No bypass of the nine deal-validation gates.

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Record the corrected architecture and rollout constraints | `plans/ADR-020-reddit-post-lifecycle.md`, `plans/GOAP_STATE.md`, `plans/INDEX.md` | low |
| 2 | Add D1 lifecycle schema to both migration paths | `migrations/0005_reddit_posts.sql`, `worker/lib/d1/migrations/schema-part-5.ts` | medium |
| 3 | Implement typed OAuth, submit, health checks, and confirmed deletion | `worker/reddit.ts`, `worker/types/api.ts` | high |
| 4 | Add an isolated cron and opt-in configuration | `worker/scheduled.ts`, `wrangler.jsonc`, `.dev.vars.example` | medium |
| 5 | Verify trigger, anti-abuse, API-failure, cron, source parsing, and migration behavior | `tests/unit/reddit*.test.ts`, `tests/unit/source-expiry.test.ts`, `tests/unit/scheduled-reddit.test.ts`, `tests/unit/d1/migrations.*.test.ts` | medium |

## Acceptance Criteria

- [x] Reddit and deal-page requests use `validatedFetch`.
- [x] Reddit API failures never mark a D1 row deleted.
- [x] A successful delete response is re-read from Reddit before D1 is updated.
- [x] A score below the configured threshold deletes a tracked post.
- [x] Community deletion requires at least two unique, non-bot accounts that
  are at least seven days old.
- [x] Source-page deletion uses conservative expiry phrases and a bounded read.
- [x] No commenter identifier or comment content is persisted or logged.
- [x] The moderation cron cannot fall through to the discovery pipeline.
- [x] Missing Reddit configuration makes the cron a logged no-op.
- [x] Credentials alone cannot activate lifecycle actions; the explicit enable
  flag defaults to false.
- [ ] Unit tests, typecheck, formatting, Markdown lint, and security gates pass.

## Open Questions

- [ ] Production enablement requires confirmation that the Reddit app has Data
  API access and that the use case complies with Reddit's current terms.
- [ ] Production enablement requires a tracing-disabled execution boundary so
  commenter account-age lookup URLs are not retained in automatic fetch spans.
- [ ] The target subreddit must permit automated deal posts and deletion by the
  configured bot account.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| False-positive deletion | high | Conservative source phrases, two-user minimum, seven-day account age, tests |
| Reddit API or rate-limit failure | medium | Bounded work per run, token reuse, checked responses, retry on next cron |
| Orphaned or falsely deleted D1 state | high | Persist only confirmed submissions/deletions; fail closed |
| SSRF through deal URLs | high | Mandatory `validatedFetch` and HTTPS/DNS validation |
| Personal-data retention | medium | Count usernames in-memory only; persist aggregate count |

## Dependencies

- [ ] Reddit script application credentials with `read`, `submit`, and `edit`
  capabilities.
- [x] D1 binding and migration runner.
- [x] Structured logger and SSRF-safe fetch helper.

## Out of Scope for This Spec

- Automatically selecting which validated deals should be posted.
- Moderator removal, reporting, voting, or interaction with third-party posts.
- Historical Reddit data ingestion.
