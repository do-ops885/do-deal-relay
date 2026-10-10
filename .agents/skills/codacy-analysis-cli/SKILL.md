---
name: codacy-analysis-cli
description: Uses the Codacy Analysis CLI to run local static analysis on repositories or specific files. Handles installation, initialization, dependency management, dry-runs, and analysis with JSON output. Use whenever the user wants to analyze code locally, run static analysis, scan for bugs or security issues, lint files, check code quality without pushing to Codacy, or run tools like ESLint, Ruff, Semgrep, RuboCop, or any other supported analyzer on their machine. Also trigger when the user asks to analyze staged changes, scan a PR locally, or set up local Codacy analysis.
license: MIT
metadata:
  author: Codacy
  version: 1.4.0
---

# Codacy Analysis CLI

> **Upstream:** codacy/codacy-skills. Analysis runs on this machine; results can differ from Codacy Cloud, and a tool is only usable when its runtime (Docker, Node, Python) is present.
>
> **Glossary:** See [glossary.md](../../../agents-docs/references/glossary.md) for shared definitions of Codacy concepts (issues, findings, severity, coverage, tools, patterns, etc.).

The Codacy Analysis CLI (`codacy-analysis`) runs static analysis locally on a repository. It detects languages, selects tools, and reports issues — without pushing code to Codacy. This is a different tool from the Codacy Cloud CLI (`codacy`), which queries remote Codacy data.

Always use `--output-format json` for structured output in agentic workflows.

## Setup

```bash
# Install
npm i -g @codacy/analysis-cli

# Verify
codacy-analysis --help
```

### Authentication (optional)

Authentication is only required for `init --remote` (fetching config from a Codacy repository). Local analysis works without authentication.

```bash
# Option 1: Interactive login
codacy-analysis login

# Option 2: Token flag
codacy-analysis login --token <your-api-token>

# Option 3: Environment variable
export CODACY_API_TOKEN=<your-api-token>

# Obtain tokens: Codacy > My Account > Access Management

# Remove credentials
codacy-analysis logout
```

**Shared session:** The Analysis CLI and the Cloud CLI (`codacy`) share the same credentials at `~/.codacy/credentials`. Logging in or out with either CLI applies to both — there is no need to authenticate separately.


## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "`tsc` and `prettier` already pass, so local Codacy analysis adds nothing." | `codacy-analysis analyze` runs ESLint9, Semgrep, Ruff and the other tools in `.codacy/codacy.config.json`; `npm run lint` only type-checks and formats. |
| "Analysis is slow, so run it once over the whole tree at the end." | `--pr`, `--diff`, and `--staged` scope the run to changed files; use them instead of a full-tree pass. |
| "A non-zero exit means the repo has bugs." | Exit 2 is an execution error (missing dependency or tool crash); `--inspect` and `--fail-if-missing` separate setup failures from real issues. |
| "The text output is fine to read directly." | Agent workflows must pass `--output-format json` and parse `.issues` and `.toolResults`; text output has no stable shape. |

## Red Flags

- [ ] A tool missing from `codacy-analysis analyze --inspect --output-format json` is treated as a clean result.
- [ ] The whole repository is analyzed when `--pr` or `--diff` would cover the change.
- [ ] `update-config` is run on a config that was hand-edited after a bare `init`.
- [ ] Exit 1 (issues found) and exit 2 (execution error) are reported the same way.
- [ ] `exclude_paths` in `.codacy.yml` are ignored, so `migrations/**` and test fixtures get re-flagged.


## Reference

- [Getting help](reference/01-getting-help.md)
- [Filesystem conventions](reference/02-filesystem-conventions.md)
- [Provider values](reference/03-provider-values.md)
- [Analysis workflow](reference/04-analysis-workflow.md)
- [Common workflows](reference/05-common-workflows.md)
- [Troubleshooting](reference/06-troubleshooting.md)
