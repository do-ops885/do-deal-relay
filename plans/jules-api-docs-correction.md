# Jules API Documentation Correction - Execution Plan

**Parent Goal**: Fix incorrect Jules API base URL, auth header, and endpoints in jules-usage skill files.

## File Change Summary

| File | Key Changes |
|------|------------|
| `SKILL.md` | Update API fallback section: URL, auth header, endpoints, add correct API reference table |
| `references/commands.md` | Update REST API examples: correct URL, auth, endpoints |
| `scripts/jules_api_request.sh` | Fix base URL and auth header in shell script |
| `evals/evals.json` | Update API fallback eval assertions to match correct endpoints |
| `evals/results.json` | Update results to reflect corrected documentation |

## Correct Values to Apply

- **Base URL**: `https://jules.googleapis.com/v1alpha`
- **Auth Header**: `x-goog-api-key: $JULES_API_KEY`
- **API Key Source**: `jules.google.com/settings`
- **Endpoints**: Sessions (`/sessions`), Activities (`/sessions/{id}/activities`), Sources (`/sources`), Types
- **Error Format**: `{"error":{"code":400,"message":"...","status":"INVALID_ARGUMENT"}}`

## Execution Strategy

**Phase 1**: Create plan + coordination setup (this file)
**Phase 2**: Parallel file updates (4 agents)
**Phase 3**: Validation (test suite + quality gate + code review in parallel)
**Phase 4**: Commit + push via ai-commit.sh
