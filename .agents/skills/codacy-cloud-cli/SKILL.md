---
name: codacy-cloud-cli
description: Uses the Codacy Cloud CLI to query repositories, issues, security findings, pull requests, tools, and patterns on Codacy Cloud. Use whenever the user mentions Codacy, asks about code quality metrics, wants to check issues or findings in a repo, inspect a pull request analysis, browse security vulnerabilities, enable or disable tools, search patterns, trigger a reanalysis, or interact with any remote Codacy data — even if they don't say "Codacy CLI" explicitly.
license: MIT
metadata:
  author: Codacy
  version: 1.5.0
---

# Codacy Cloud CLI

> **Upstream:** codacy/codacy-skills. Every command here needs a Codacy API token; without one, `codacy info` and all queries fail.
>
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

| Concern | Counter-Argument |
|---------|------------------|
| "Local analysis found nothing, so the Cloud query is unnecessary." | Local tools do not cover cloud-only tools; `codacy issues -O -o json` is the only source for those findings. |
| "`codacy info` failed, so the CLI is broken." | A missing or expired `CODACY_API_TOKEN` fails the same way; run `codacy login` or re-export the token before concluding anything. |
| "Every command needs provider, org, and repo spelled out." | Inside the repo the CLI auto-detects them from the git remote, so `codacy pull-request <prNumber>` runs bare. |
| "Reanalysis finishes quickly, so poll it by hand." | `--reanalyze-and-wait` blocks until the run ends (up to 20 minutes); `--reanalyze` is fire-and-forget only when you will re-check. |

## Red Flags

- [ ] A coverage or pass/fail claim is made from local results the Cloud CLI never returned.
- [ ] `codacy issues -O -o json` output is read as flat fields instead of the nested `.overview` structure.
- [ ] `--ignore-issue` is used with no `--ignore-reason`.
- [ ] A reanalysis is triggered without `--reanalyze-and-wait` and the old numbers are reported as current.
- [ ] `~/.codacy/credentials` is edited by hand, or a second login is attempted for `codacy-analysis`.


## Reference

- [Getting help](reference/01-getting-help.md)
- [Provider values](reference/02-provider-values.md)
- [Auto-detection of repository parameters](reference/03-auto-detection-of-repository-parameters.md)
- [How Codacy data works](reference/04-how-codacy-data-works.md)
- [Command reference](reference/05-command-reference.md)
- [Common workflows](reference/06-common-workflows.md)
