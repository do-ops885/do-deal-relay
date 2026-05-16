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
- If the CLI is unavailable, use the Jules REST API with `JULES_API_KEY`.
  - `curl -H "Authorization: Bearer $JULES_API_KEY" -H "Content-Type: application/json" \
    -d '{"repo":"'$repo'","path":"."}' \
    https://api.jules.google/v1/repo/check`
  - Confirm the exact endpoint and payload via `https://jules.google/docs/api/`.

## Jules task capacity checks

- `jules remote list` — List active remote sessions to check capacity.
- `jules --help` — Discover available commands if the interface changes.
- API fallback:
  - `curl -H "Authorization: Bearer $JULES_API_KEY" https://api.jules.google/v1/tasks`
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
- `gh pr create --title "Add Jules validation guidance" --body "This PR adds Jules usage documentation and error-handling guidance for repo checks." --base main`
