---
name: jules-usage
description: Use the Jules CLI with this repository; install it when absent, create sessions for long-running tasks, label GitHub issues for Jules, and leave PR guidance for feedback-driven fixes.
license: MIT
compatibility: Requires shell access, git repo context, and GitHub issue/PR metadata.
---

# Jules Usage

Use this skill when the agent needs to interact with the Jules CLI in this repository, manage long-running repository tasks, or coordinate feedback handling through GitHub.

## Overview

Jules is an asynchronous AI coding agent that handles long-running tasks such as e2e tests, audits, repository validation, and feedback-driven code fixes. This skill provides instructions for installing Jules, creating sessions, verifying repo context, managing GitHub issue/PR labeling, and handling error scenarios.

## Quick Start

```bash
# 1. Verify Jules is installed
command -v jules

# 2. Create a new Jules session for the current repo
jules new

# 3. Or create a remote session
jules remote new

# 4. Check repo context with gh CLI
gh auth status && gh repo view --json nameWithOwner

# 5. Label a GitHub issue for Jules (after confirming capacity)
gh issue edit <NUMBER> --add-label jules
```

## When to use this skill

- The task involves a long-running validation or automation flow such as e2e, full-suite regression, audit, or repository health checks.
- The task requires using the Jules CLI against this repo.
- The task should make GitHub issues or PRs explicit about using Jules for follow-up action.

## Installation / verification

1. Check whether `gh` is installed:
   - `command -v gh >/dev/null 2>&1`
2. Check whether `jules` is installed:
   - `command -v jules >/dev/null 2>&1`
3. If `gh` is not installed, report that GitHub CLI is required for repo metadata and issue/PR automation.
4. If `jules` is not installed, attempt to install it:
   - `npm install -g @jules/cli`
   - Verify with `jules --help` after installation.
5. If the Jules CLI installation fails or cannot be used, fall back to the Jules REST API.
   - Ensure `JULES_API_KEY` is set (get your key from `https://jules.google.com/settings`).
   - Use `x-goog-api-key` header (not `Authorization: Bearer`).
   - The base URL is `https://jules.googleapis.com/v1alpha`.
   - Consult the official Jules API docs at `https://jules.google/docs/api/` for exact endpoints and payloads.
6. If neither CLI nor API access is available, stop and report the failure clearly.

## Repository setup and verification

- Use `gh` to confirm repository context and checkout status.
- Verify authentication and repo access:
  - `gh auth status`
  - `gh repo view --json nameWithOwner,defaultBranchRef --jq '.nameWithOwner + " on " + .defaultBranchRef.name'`
- If the current workspace is not the correct repo, discover the owner/name dynamically and clone it with:
  - `repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)`
  - `gh repo clone "$repo" .`
- Confirm the repo root and branch before running Jules.
- Before setting the `jules` label, check that Jules has an available task slot and is not already at the concurrency limit.
  - Run `jules remote list` to inspect active remote sessions.
  - If the service reports that 3 tasks are already running (or active sessions are at capacity), do not add the label yet.
  - If a task creation failure occurs after labeling, remove and re-add the label only after confirming capacity is free.

## Repository check flow

- Prefer the official Jules repo validation command for this repository.
- If the exact command is unknown, use `jules --help` or `jules help` to discover the available commands.
- Use Jules to validate or work with the repository from the repo root:
  - `jules new` — Assign a new session to Jules for the current repository (defaults to cwd).
  - `jules remote new` — Create a new remote session for the repository.
  - `jules remote list` — List active remote sessions.
  - `jules teleport <remote-url>` — Clone a repository and apply session changes, or apply to an existing repo.
- If the CLI is unavailable, use the Jules REST API to perform the equivalent repo validation.
  - Example pattern (correct API):
    - `curl -H "x-goog-api-key: $JULES_API_KEY" -H "Content-Type: application/json" \
      https://jules.googleapis.com/v1alpha/sessions`
  - Available resources: `Sessions`, `Activities` (under `/sessions/{id}/activities`), `Sources`, `Types`.
  - Pagination uses `pageSize` and `pageToken` query parameters.
  - Errors return Google-style format: `{"error": {"code": 400, "message": "...", "status": "INVALID_ARGUMENT"}}`.
  - HTTP codes: 200 (OK), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 429 (rate limited), 500 (server error).
  - Confirm the exact endpoint and request shape against `https://jules.google/docs/api/`.
- If a Jules task fails to create because of a full queue or service issue, report the failure and retry later.
- Do not proceed to automation without confirming the command or API request succeeds.

## GitHub issue and PR behavior

- For long-running tasks such as e2e runs, audits, or heavy validation jobs, use GitHub issues to track the work and add the label `jules`.
- Before adding the `jules` label, verify Jules has task capacity and the job is free to run; do not label issues when the service is already at 3 active tasks.
- If a task creation failure is reported after labeling, remove the label, wait for capacity, and re-add the label only once Jules can accept the job.
- When creating an issue, use `gh issue create --title "..." --body "..." --label jules` and include the task context, repo, and expected outcome.
- For pull requests not opened by Jules, add a comment with the exact instruction:

  `@jules address and analyze feedback for impact the codebase, if has impact change, git commit, git push all changes back to the branch`

- If the PR itself needs to be opened manually, use `gh pr create --title "..." --body "..." --base main` from the repo root.
- Ensure the comment includes sufficient context about the PR, the requested changes, and any existing reviewer feedback.

## Edge cases

- If the repository is not a git repository or GitHub metadata is unavailable, do not attempt GitHub issue or PR automation guidance.
- If the Jules CLI install command is unavailable in the runtime environment, explain that `jules` cannot be used and suggest alternative validation options.
- Always capture and report the exact command output when something fails.

## Rationalizations

| Concern | Counter-Argument |
|---------|-----------------|
| Relying on an external CLI (`jules`) adds a runtime dependency that may not be available. | The skill has a clear install-fallback protocol (CLI → REST API → report failure). If neither is available, the agent stops with a clear report rather than proceeding blindly. |
| Adding the `jules` label to issues without task capacity confirmation could queue jobs that never run. | The skill mandates checking `jules remote list` before labeling and removing/re-adding the label if task creation fails. This prevents silent queue buildup. |
| The PR comment format for Jules is tightly coupled to a specific expected string. | The exact instruction is documented and tested; if the Jules CLI changes its command format, this skill only needs one string update. |

## Red Flags

- [ ] Do not add the `jules` label without first verifying Jules has available task capacity.
- [ ] Do not attempt to install `jules` globally with `npm` unless the environment has write access to the global prefix.
- [ ] Do not fall back to the Jules REST API without first confirming the API key is available in the environment.
- [ ] Do not leave a failed `jules` install or API attempt unresolved — always report the exact failure output.
- [ ] Do not proceed with PR automation if the repo is not a GitHub repository or `gh` metadata is unavailable.

## References

See `references/commands.md` for example `gh` and `jules` commands, plus task-capacity and failure-handling guidance.
