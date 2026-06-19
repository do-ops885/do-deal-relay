# ADR-005: Correct Jules API Documentation in jules-usage Skill

**Date**: 2026-05-16
**Status**: Active
**Strategy**: GOAP with parallel swarm coordination

## Context

During verification of the jules-usage skill against the official Jules API documentation at `https://jules.google/docs/api/reference/overview/`, several critical discrepancies were discovered between what the skill documents and the actual API behavior.

### Discrepancies Found

| Aspect | Skill Documents (WRONG) | Official API (CORRECT) |
|--------|-----------------------|----------------------|
| **Base URL** | `https://api.jules.google` | `https://jules.googleapis.com/v1alpha` |
| **Auth header** | `Authorization: Bearer $JULES_API_KEY` | `x-goog-api-key: $JULES_API_KEY` |
| **Endpoints** | `/v1/repo/check`, `/v1/tasks` | Sessions, Activities, Sources, Types |
| **Error format** | Not documented | Google-style `{error: {code, message, status}}` |
| **API key source** | Not documented | `jules.google.com/settings` |
| **Pagination** | Not documented | `pageSize` and `pageToken` |

### Affected Files

1. `.agents/skills/jules-usage/SKILL.md` — API fallback section has wrong URL/auth
2. `.agents/skills/jules-usage/references/commands.md` — REST API examples wrong
3. `.agents/skills/jules-usage/scripts/jules_api_request.sh` — Shell script uses wrong URL/auth
4. `.agents/skills/jules-usage/evals/evals.json` — Eval assertions reference wrong endpoints
5. `.agents/skills/jules-usage/evals/results.json` — Results need updating

## Decision

We will update all affected files to use the correct API configuration discovered from the official documentation:

### Correct API Details

| Detail | Value |
|--------|-------|
| **Base URL** | `https://jules.googleapis.com/v1alpha` |
| **Auth** | `x-goog-api-key` header (not Bearer token) |
| **API Key Source** | `jules.google.com/settings` (settings page, not environment auto-setup) |
| **Resources** | Sessions, Activities, Sources, Types |
| **Pagination** | `pageSize` and `pageToken` parameters |
| **HTTP Codes** | 200, 400, 401, 403, 404, 429, 500 |
| **Error Format** | `{"error": {"code": 400, "message": "...", "status": "INVALID_ARGUMENT"}}` |

### Update Strategy

Each file will be updated independently in parallel, then validated together.

## Consequences

**Positive**:
- Skill documentation matches real API behavior
- Shell scripts work when API key is configured
- Eval tests validate correct documentation
- Future users get accurate guidance

**Negative**:
- Existing users relying on wrong docs need to update their scripts
- The `x-goog-api-key` header may require different environment variable setup

## Implementation

See [jules-api-docs-correction.md](jules-api-docs-correction.md) for the detailed execution plan.

## Validation

- All 40 test suite tests pass after updates
- Quality gate passes (13 gates)
- Prettier format check passes
- Shell scripts pass `bash -n` syntax check
- API key env var check still works correctly
