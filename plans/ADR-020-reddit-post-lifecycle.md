# ADR-020: Fail-Closed Reddit Post Lifecycle

**Status**: Accepted for implementation; production activation gated
**Created**: 2026-08-01
**Decision Maker**: do-deal-relay maintainers
**Type**: External integration and automated moderation

## Context

The proposed Reddit integration correctly identifies three useful expiry
signals: negative community score, corroborating comments, and explicit expiry
text at the deal source. Its sample implementation is not production-safe:

- the source-page trigger is described but absent;
- comment listings do not provide `author_created_utc`, so account age requires
  a separate user-about request;
- raw `fetch` violates the repository's SSRF policy;
- unchecked API responses can record a deletion that Reddit rejected;
- the proposed cron branch does not match the existing handler and would fall
  through to a full discovery run;
- `claimed` is ambiguous and can indicate a successful deal, not expiry;
- storing voter usernames in `delete_reason` creates unnecessary personal-data
  retention;
- one unbounded loop can exceed Worker duration and Reddit API limits.

## Decision

Implement an opt-in lifecycle manager with the following invariants:

1. All outbound requests use `validatedFetch`, including fixed Reddit hosts.
2. OAuth uses the bot's script-account password grant and reuses one token per
   moderation run.
3. Reddit responses and Reddit JSON error arrays are checked before D1 state is
   changed. Deletion is re-read from Reddit and must contain the exact fullname
   plus Reddit's explicit self-post deletion tombstone before D1 is marked
   deleted; an empty listing is indeterminate and fails closed.
4. Community flags are deduplicated in memory. Only keyword-matching authors
   receive an account-age lookup, and no username or comment body is persisted.
5. The ambiguous `claimed` keyword is excluded. Matching uses conservative
   phrases rather than unrestricted substring checks.
6. Source pages are read with a timeout and byte cap. Only explicit HTML or
   plain-text media types are accepted, and only explicit expiry phrases in
   selected HTML status elements trigger deletion.
7. Work is ordered by `last_checked_at` and capped per invocation so every post
   is eventually revisited without exhausting the API budget.
8. A dedicated cron returns after moderation and cannot execute discovery.
9. Missing credentials disable moderation safely; they do not invalidate the
   rest of the Worker configuration.
10. Credentials do not activate the integration. The separate
    `REDDIT_LIFECYCLE_ENABLED=true` switch is required.
11. Production activation is blocked until Reddit API access, subreddit policy
    approval, and a tracing-disabled execution boundary are confirmed. The
    current Worker's automatic fetch traces would otherwise retain public
    commenter identifiers in user-about request URLs.

## Consequences

### Positive

- D1 remains an accurate lifecycle ledger rather than an optimistic log.
- The design implements all three stated triggers.
- Anti-abuse checks use data Reddit actually exposes.
- Existing pipeline schedules and validation gates remain unchanged.
- Privacy exposure is limited to transient processing of public usernames.

### Negative

- A community flag can require one additional Reddit request per unique author.
- The password grant requires securely managed bot credentials.
- A bounded batch means large backlogs are processed over multiple cron runs.
- Source text checks remain heuristic and therefore deliberately conservative.

## Alternatives Rejected

### Paste the proposed module unchanged

Rejected because it silently disables account-age validation, omits one trigger,
bypasses SSRF controls, and can claim deletion after an API error.

### Use comment count without account-age lookups

Rejected because two disposable accounts could immediately remove a post.

### Store usernames for auditability

Rejected because aggregate evidence is sufficient for the deletion decision and
usernames add avoidable personal-data retention.

### Couple submission to `publishSnapshot`

Rejected because publishing a validated snapshot is not consent to post on an
external community. Submission remains an explicit API call.

## Rollout and Rollback

1. Apply the D1 migration.
2. Register and obtain approval for a Reddit script application.
3. Configure secrets with `wrangler secret put`; configure only non-secret
   thresholds as vars.
4. Move moderation to a tracing-disabled execution boundary or disable traces
   for this Worker.
5. Set `REDDIT_LIFECYCLE_ENABLED=true`, run the cron with no tracked posts, and
   inspect structured logs.
6. Insert one test post through the explicit submission path, then monitor at
   least two moderation intervals.

Rollback is disabling/removing the moderation cron. Existing D1 rows remain as
an audit ledger; no Reddit content is restored automatically.

## References

- [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki)
- [Reddit API endpoint documentation](https://www.reddit.com/dev/api/)
- [PEV specification](SPEC-reddit-post-lifecycle.md)
