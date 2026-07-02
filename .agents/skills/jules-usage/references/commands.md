# Jules Usage Reference Commands

The following commands are examples for checking repo context, validating repository state with Jules, and handling limited Jules task capacity.

## GitHub CLI repository checks

- `gh auth status`
- `gh repo view --json nameWithOwner,defaultBranch`
- `gh repo view --json nameWithOwner --jq .nameWithOwner`
- Use the repo owner/name output from `gh repo view --json nameWithOwner` when cloning or verifying the repo.

## Jules availability and repo validation

- `command -v jules >/dev/null 2>&1`
- `jules --help`
- `jules help`
- `jules new` — Assign a new session to Jules for the current repo (defaults to cwd).
- `jules remote new` — Create a new remote session for the repository.
- `jules remote list` — List active remote sessions.
- `jules teleport <remote-url>` — Clone and apply session changes, or apply to existing repo.
- If the CLI is unavailable, use the Jules REST API.
  - **Base URL**: `https://jules.googleapis.com/v1alpha`
  - **Auth header**: `x-goog-api-key: $JULES_API_KEY` (not `Authorization: Bearer`)
  - **API key source**: `https://jules.google.com/settings`

### API Resources

#### Sessions

| Endpoint | Description | Example |
|----------|-------------|---------|
| `GET /sessions` | List sessions | `curl -H "x-goog-api-key: $JULES_API_KEY" https://jules.googleapis.com/v1alpha/sessions` |
| `GET /sessions/{id}` | Get session details | `curl ... https://jules.googleapis.com/v1alpha/sessions/{id}` |
| `DELETE /sessions/{id}` | Delete a session | `curl -X DELETE ... https://jules.googleapis.com/v1alpha/sessions/{id}` |
| `POST /sessions` | Create session | `curl -X POST -d '{"source":"sources/github/owner/repo"}' ...` |

Response: `{"sessions": [{...}], "nextPageToken": "..."}`
Session fields: `name`, `id`, `state` (IN_PROGRESS/COMPLETED/FAILED), `title`, `prompt`, `sourceContext`, `url`, `createTime`, `updateTime`, `outputs`

#### Activities

| Endpoint | Description |
|----------|-------------|
| `GET /sessions/{id}/activities` | List activities for a session |
| `GET /sessions/{id}/activities/{activityId}` | Get specific activity |

Activity fields: `name`, `id`, `createTime`, `originator` (agent/user), `planGenerated`, `planApproved`, `progressUpdated`, `artifacts[changeSet[{gitPatch}]]`

#### Sources

| Endpoint | Description | Example |
|----------|-------------|---------|
| `GET /sources` | List connected repos | `curl -H "x-goog-api-key: $JULES_API_KEY" https://jules.googleapis.com/v1alpha/sources` |
| `GET /sources/{sourceId}` | Get source details | `curl ... https://jules.googleapis.com/v1alpha/sources/github/owner/repo` |

Source fields: `name` (sources/github/{owner}/{repo}), `id` (github/{owner}/{repo}), `githubRepo.owner`, `githubRepo.repo`, `githubRepo.defaultBranch`, `githubRepo.branches`

### Pagination
```
GET /sessions?pageSize=10&pageToken=NEXT_PAGE_TOKEN
```

### Error Format
```json
{"error": {"code": 400, "message": "...", "status": "FAILED_PRECONDITION|INVALID_ARGUMENT|..."}}
```

### API Key Verification
```bash
# Test that API key is valid by listing sessions
curl -sS -w "\nHTTP_CODE: %{http_code}" \
  -H "x-goog-api-key: $JULES_API_KEY" \
  -H "Content-Type: application/json" \
  https://jules.googleapis.com/v1alpha/sessions
# Expect: HTTP 200 + JSON with sessions array
```

Confirm the exact endpoint and payload via `https://jules.google/docs/api/`.

## Jules task capacity checks

- `jules remote list` — List active remote sessions to check capacity.
- `jules --help` — Discover available commands if the interface changes.
- API fallback:
  - `curl -H "x-goog-api-key: $JULES_API_KEY" -H "Content-Type: application/json" \
    https://jules.googleapis.com/v1alpha/sessions`
  - Sessions list shows active tasks and capacity.
  - Confirm active task count and capacity through the Jules API if CLI is unavailable.
  - If the service reports that 3 tasks are already running, do not add the label yet.

## Failure-handling guidance

- If a task creation failure is reported after marking with `jules`, remove the `jules` label and wait until task capacity is free.
- If the service reports that 3 tasks are already running, hold off on adding the label until an active task completes.
- If the error message says "Jules has failed to create a task", confirm capacity before retrying:
  1. Remove the `jules` label.
  2. Re-check task availability.
  3. Re-add the label only when Jules can accept the job again.

## GitHub issue / PR creation examples

- `gh issue create --title "Jules e2e validation" --body "Task: verify repository with Jules. Attach relevant logs and environment details." --label jules`
- `gh pr create --title "Add Jules validation guidance" --body "This PR adds Jules usage documentation and error-handling guidance for repo checks." --base develop`
