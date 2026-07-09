---
name: codacy-analysis-cli
description: Uses the Codacy Analysis CLI to run local static analysis on repositories or specific files. Handles installation, initialization, dependency management, dry-runs, and analysis with JSON output. Use whenever the user wants to analyze code locally, run static analysis, scan for bugs or security issues, lint files, check code quality without pushing to Codacy, or run tools like ESLint, Ruff, Semgrep, RuboCop, or any other supported analyzer on their machine. Also trigger when the user asks to analyze staged changes, scan a PR locally, or set up local Codacy analysis.
license: MIT
metadata:
  author: Codacy
  version: 1.4.0
---

# Codacy Analysis CLI

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

- Skills imported from codacy/codacy-skills open-source repository
- Cross-skill references use relative paths to shared glossary
- All tools documented with CLI flags and JSON output for agent workflows


## Red Flags

- Requires Codacy API token for Cloud operations
- Local analysis may differ from Cloud analysis results
- Tool availability depends on machine dependencies (Docker, language runtimes)


## Reference

- [Getting help](reference/01-getting-help.md)
- [Filesystem conventions](reference/02-filesystem-conventions.md)
- [Provider values](reference/03-provider-values.md)
- [Analysis workflow](reference/04-analysis-workflow.md)
- [Common workflows](reference/05-common-workflows.md)
- [Troubleshooting](reference/06-troubleshooting.md)
