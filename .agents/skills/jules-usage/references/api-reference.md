# Jules REST API Reference

> **Source**: Official docs at https://jules.google/docs/api/reference/overview/
> **Last Verified**: 2026-05-16 (live API calls confirmed)

---

## Base URL

```
https://jules.googleapis.com/v1alpha
```

## Authentication

```
Header: x-goog-api-key: YOUR_API_KEY
```

Get your API key from: https://jules.google.com/settings

---

## Resources

### Sessions

Manage units of work where Jules executes tasks.

#### Schema

```json
{
  "sessions": [
    {
      "name": "sessions/EXAMPLE_SESSION_ID",
      "id": "EXAMPLE_SESSION_ID",
      "state": "IN_PROGRESS",
      "title": "Session title",
      "prompt": "The instruction given to Jules",
      "sourceContext": {
        "owner": "ORG_NAME",
        "repo": "REPO_NAME",
        "branch": "main"
      },
      "url": "https://jules.google.com/task/...",
      "createTime": "2026-05-16T21:00:00Z",
      "updateTime": "2026-05-16T21:30:00Z",
      "outputs": [
        {
          "type": "PULL_REQUEST",
          "pullRequest": {
            "number": 42,
            "title": "Example pull request title",
            "url": "https://github.com/ORG_NAME/REPO_NAME/pull/42",
            "state": "OPEN"
          }
        }
      ]
    }
  ],
  "nextPageToken": "TOKEN_FOR_NEXT_PAGE"
}
```

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sessions` | List sessions (paginated) |
| `GET` | `/sessions/{sessionId}` | Get session by ID |
| `POST` | `/sessions` | Create session (requires source context) |
| `DELETE` | `/sessions/{sessionId}` | Delete a session |

#### Fields

| Field | Type | Values |
|-------|------|--------|
| `name` | string | `sessions/{sessionId}` |
| `id` | string | Numeric identifier |
| `state` | enum | `IN_PROGRESS`, `COMPLETED`, `FAILED` |
| `title` | string | Human-readable title |
| `prompt` | string | The instruction given to Jules |
| `sourceContext` | object | `{owner, repo, branch}` |
| `url` | string | Link to Jules UI |
| `createTime` | timestamp | ISO 8601 |
| `updateTime` | timestamp | ISO 8601 |
| `outputs` | array | Produced artifacts (PRs, patches) |

---

### Activities

Monitor session progress — plans, approvals, messages, and code changes.

#### Schema

```json
{
  "activities": [
    {
      "id": "activity-1",
      "name": "sessions/EXAMPLE_SESSION_ID/activities/activity-1",
      "createTime": "2026-05-16T21:00:00Z",
      "originator": "agent",
      "planGenerated": {
        "plan": {
          "id": "plan-uuid",
          "steps": [
            {"title": "Analyze codebase", "description": "Review repo structure"},
            {"title": "Implement change", "description": "Make necessary modifications"}
          ]
        }
      }
    },
    {
      "id": "activity-2",
      "name": "sessions/.../activities/activity-2",
      "createTime": "2026-05-16T21:05:00Z",
      "originator": "user",
      "planApproved": {
        "planId": "plan-uuid"
      }
    },
    {
      "id": "activity-3",
      "name": "sessions/.../activities/activity-3",
      "createTime": "2026-05-16T21:10:00Z",
      "originator": "agent",
      "progressUpdated": {
        "title": "Generating code",
        "description": "Working on step 1 of 3"
      },
      "artifacts": [
        {
          "changeSet": {
            "gitPatch": {
              "unidiffPatch": "diff --git a/file.ts b/file.ts\n...\n+PATCH_CONTENT",
              "baseCommitId": "abc123def456"
            }
          }
        }
      ]
    }
  ]
}
```

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sessions/{sessionId}/activities` | List activities for a session |
| `GET` | `/sessions/{sessionId}/activities/{activityId}` | Get specific activity |

#### Activity Types

| Type | Description | Fields |
|------|-------------|--------|
| `planGenerated` | AI generated a plan | `plan`: `{id, steps[{title, description}]}` |
| `planApproved` | User approved the plan | `planId`: string |
| `progressUpdated` | AI progress update | `title`, `description` |
| `artifacts` | Output data | `changeSet[{gitPatch: {unidiffPatch, baseCommitId}}]` |

---

### Sources

Connected GitHub repositories.

#### Schema

```json
{
  "sources": [
    {
      "id": "github/ORG_NAME/REPO_NAME",
      "name": "sources/github/ORG_NAME/REPO_NAME",
      "githubRepo": {
        "owner": "ORG_NAME",
        "repo": "REPO_NAME",
        "defaultBranch": "main",
        "branches": [
          {"displayName": "main"},
          {"displayName": "develop"}
        ]
      }
    }
  ]
}
```

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sources` | List connected sources |
| `GET` | `/sources/{sourceId}` | Get source by ID |
| `POST` | `/sources` | Register a new source |

#### Fields

| Field | Type | Pattern |
|-------|------|---------|
| `id` | string | `github/{owner}/{repo}` |
| `name` | string | `sources/github/{owner}/{repo}` |
| `owner` | string | GitHub organization or username |
| `repo` | string | Repository name |
| `defaultBranch` | string | Default branch name |
| `branches` | array | `[{displayName}]` |

---

### Pagination

```
GET /sessions?pageSize=10&pageToken=NEXT_PAGE_TOKEN
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pageSize` | integer | Max results per page (optional, server-default) |
| `pageToken` | string | Token from `nextPageToken` in previous response |

---

### Error Handling

#### HTTP Status Codes

| Code | Meaning | Common Status |
|------|---------|---------------|
| 200 | Success | — |
| 400 | Bad Request | `INVALID_ARGUMENT`, `FAILED_PRECONDITION` |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | Key lacks permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Rate Limited | Too many requests |
| 500 | Internal Server Error | — |

#### Error Response Format

```json
{
  "error": {
    "code": 400,
    "message": "Invalid JSON payload received. Unknown name \"instruction\" at 'session': Cannot find field.",
    "status": "INVALID_ARGUMENT"
  }
}
```

#### Common Errors

| Scenario | HTTP Code | Status |
|----------|-----------|--------|
| Invalid field in request body | 400 | `INVALID_ARGUMENT` |
| Missing precondition for create | 400 | `FAILED_PRECONDITION` |
| Wrong API key | 401 | `UNAUTHENTICATED` |
| Resource not found | 404 | `NOT_FOUND` |

---

### Live Test Results (2026-05-16)

| Test | Result | Details |
|------|--------|---------|
| `GET /sessions` | ✅ PASS | HTTP 200, paginated session list returned |
| `GET /sessions/{id}/activities` | ✅ PASS | HTTP 200, activity timeline with plans + patches |
| `GET /sources` | ✅ PASS | HTTP 200, connected repos listed |
| `POST /sessions {title, prompt}` | ⚠️ INFO | HTTP 400 `FAILED_PRECONDITION` — requires source context |
| API key validity | ✅ PASS | 53-char key, `x-goog-api-key` header works |
| Base URL | ✅ PASS | `jules.googleapis.com/v1alpha` resolves correctly |

---

## Quick Reference

```bash
# List sessions
curl -H "x-goog-api-key: $JULES_API_KEY" \
     https://jules.googleapis.com/v1alpha/sessions

# List activities for a session
curl -H "x-goog-api-key: $JULES_API_KEY" \
     https://jules.googleapis.com/v1alpha/sessions/SESSION_ID/activities

# List sources
curl -H "x-goog-api-key: $JULES_API_KEY" \
     https://jules.googleapis.com/v1alpha/sources

# Paginated query
curl -H "x-goog-api-key: $JULES_API_KEY" \
     "https://jules.googleapis.com/v1alpha/sessions?pageSize=5&pageToken=TOKEN"
```
