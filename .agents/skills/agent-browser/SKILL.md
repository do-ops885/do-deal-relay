---
name: agent-browser
description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", or any task requiring programmatic web interaction.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
allowed-tools: Bash(npx agent-browser:*), Bash(agent-browser:*)
---

# Browser Automation with agent-browser

The CLI uses Chrome/Chromium via CDP directly. Install via `npm i -g agent-browser`, `brew install agent-browser`, or `cargo install agent-browser`. Run `agent-browser install` to download Chrome. Existing Chrome, Brave, Playwright, and Puppeteer installations are detected automatically. Run `agent-browser upgrade` to update to the latest version.

## Core Workflow

Every browser automation follows this pattern:

1. **Navigate**: `agent-browser open <url>`
2. **Snapshot**: `agent-browser snapshot -i` (get element refs like `@e1`, `@e2`)
3. **Interact**: Use refs to click, fill, select
4. **Re-snapshot**: After navigation or DOM changes, get fresh refs

```bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Submit"

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Check result
```


## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "The `@e` refs from my first snapshot are still valid." | Reference 12 (Ref Lifecycle) invalidates refs on navigation or DOM mutation; every interaction needs a fresh `snapshot -i`. |
| "I will target elements with a hand-written CSS selector instead of snapshotting." | The workflow is open, snapshot, then act on a ref; semantic locators (reference 14) are the sanctioned fallback, and guessed selectors silently hit the wrong node. |
| "Leaving the session up is harmless for a one-off run." | Reference 11 covers session management and cleanup; orphaned sessions and held profile locks make the next run nondeterministic. |
| "A screenshot proves the page changed the way I expect." | Reference 08 (diffing) is what verifies the change; an image alone cannot show which DOM or value actually moved. |

## Red Flags

- [ ] Clicks or fills issued against refs captured before a navigation or DOM update.
- [ ] No `snapshot -i` between an action and the assertion that it worked.
- [ ] A fixed `sleep` used instead of `wait --load networkidle` or the timeout guidance in reference 09.
- [ ] Login credentials typed into commands rather than the authenticated-session template.
- [ ] Browser left running at task end with no cleanup.

## Reference

- [Command Chaining](reference/01-command-chaining.md)
- [Handling Authentication](reference/02-handling-authentication.md)
- [Essential Commands](reference/03-essential-commands.md)
- [Streaming](reference/04-streaming.md)
- [Batch Execution](reference/05-batch-execution.md)
- [Common Patterns](reference/06-common-patterns.md)
- [Security](reference/07-security.md)
- [Diffing (Verifying Changes)](reference/08-diffing-verifying-changes.md)
- [Timeouts and Slow Pages](reference/09-timeouts-and-slow-pages.md)
- [JavaScript Dialogs (alert / confirm / prompt)](reference/10-javascript-dialogs-alert-confirm-prompt.md)
- [Session Management and Cleanup](reference/11-session-management-and-cleanup.md)
- [Ref Lifecycle (Important)](reference/12-ref-lifecycle-important.md)
- [Annotated Screenshots (Vision Mode)](reference/13-annotated-screenshots-vision-mode.md)
- [Semantic Locators (Alternative to Refs)](reference/14-semantic-locators-alternative-to-refs.md)
- [JavaScript Evaluation (eval)](reference/15-javascript-evaluation-eval.md)
- [Configuration File](reference/16-configuration-file.md)
- [Deep-Dive Documentation](reference/17-deep-dive-documentation.md)
- [Browser Engine Selection](reference/18-browser-engine-selection.md)
- [Observability Dashboard](reference/19-observability-dashboard.md)
- [Ready-to-Use Templates](reference/20-ready-to-use-templates.md)
