---
description: "Poll GitHub Actions CI status for a PR until all checks complete or a failure is found"
agent: main
---

Poll CI status for PR #$1 until all checks pass or a failure is detected.

Usage: /ci-poll <pr-number> [timeout-seconds]

Default timeout: 300s (5 minutes). Polls every 30s.

Steps:
1. Confirm the PR exists: `gh pr view $1 --json title,state`
2. Poll in a loop with `gh pr checks $1 --json name,state,conclusion`
3. On each iteration:
   - If any check has `conclusion: FAILURE` or `conclusion: TIMED_OUT` → report and stop
   - If all checks have `conclusion: SUCCESS` → report success and stop
   - If checks are still `in_progress` or `pending` → sleep 30s and retry
4. If timeout exceeded with pending checks → report as "timed out waiting" with last status

Example:
```
/ci-poll 452
/ci-poll 452 600
```

Important:
- Never use `sleep N && gh pr checks` with a fixed sleep — use a loop with 30s intervals
- Filter output to show only non-passing checks: `gh pr checks $1 2>/dev/null | grep -v pass | grep -v skipping`
- Always report final status clearly (all passed / failures found / timed out)
