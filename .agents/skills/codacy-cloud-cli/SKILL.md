---
name: codacy-cloud-cli
description: Uses the Codacy Cloud CLI to query repositories, issues, security findings, pull requests, tools, and patterns on Codacy Cloud. Use whenever the user mentions Codacy, asks about code quality metrics, wants to check issues or findings in a repo, inspect a pull request analysis, browse security vulnerabilities, enable or disable tools, search patterns, trigger a reanalysis, or interact with any remote Codacy data — even if they don't say "Codacy CLI" explicitly.
license: MIT
metadata:
  author: Codacy
  version: 1.5.0
---

# Codacy Cloud CLI

> **Glossary:** See [glossary.md](../../../agents-docs/references/glossary.md) for shared definitions of Codacy concepts (issues, findings, severity, coverage, tools, patterns, etc.).

The Codacy Cloud CLI (`codacy`) is the command-line interface for Codacy Cloud. Use it whenever the user wants to interact with remote Codacy data. This is a different tool from the Codacy Analysis CLI (`codacy-analysis`), which runs static analysis locally.

## Setup

```bash
# Install
npm install -g @codacy/codacy-cloud-cli

# Authenticate — 3 options:
# 1. Set the `CODACY_API_TOKEN` environment variable
export CODACY_API_TOKEN=<token>

# 2. Use the `codacy login` command (interactive login)
codacy login

# 3. Use the `codacy login` command (with token input)
codacy login --token <token>

# Obtain tokens: Codacy > My Account > Access Management > Account API Tokens (https://app.codacy.com/account/access-management)

# Verify
codacy info
```

**Shared session:** The Cloud CLI and the Analysis CLI (`codacy-analysis`) share the same credentials at `~/.codacy/credentials`. Logging in or out with either CLI applies to both — there is no need to authenticate separately.


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
- [Provider values](reference/02-provider-values.md)
- [Auto-detection of repository parameters](reference/03-auto-detection-of-repository-parameters.md)
- [How Codacy data works](reference/04-how-codacy-data-works.md)
- [Command reference](reference/05-command-reference.md)
- [Common workflows](reference/06-common-workflows.md)
