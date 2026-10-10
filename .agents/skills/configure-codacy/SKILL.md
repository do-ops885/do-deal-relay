---
name: configure-codacy
description: Tailors Codacy configuration to a project by discovering its stack, enabling the right tools and patterns, running analysis, and intelligently reducing noise — disabling irrelevant or noisy patterns, tuning thresholds, and excluding files that shouldn't be analyzed. Produces a machine-readable summary of all changes. Use whenever the user wants to configure Codacy, reduce noise, fix false positives, enable or disable tools or patterns, tune code quality rules, deal with too many warnings, or align Codacy with their project's conventions. Also trigger when the user complains about irrelevant issues, noisy linters, or wants to set up Codacy for the first time on a repo.
license: MIT
metadata:
  author: Codacy
  version: 4.3.0
---

# Configure Codacy

> **Upstream:** codacy/codacy-skills. Needs both CLIs installed; the cloud tool list comes from Codacy, so a repo not on Codacy limits the workflow to local tools.
>
> **Glossary:** See [glossary.md](../../../agents-docs/references/glossary.md) for shared definitions of Codacy concepts (issues, findings, severity, coverage, tools, patterns, etc.).

This skill tailors Codacy configuration to a project's actual stack and coding conventions. It discovers the repository's languages and frameworks, initializes a broad set of tools and patterns, runs analysis, then intelligently cuts noise — producing a clean, high-signal configuration with a full audit trail of what changed and why.

## Prerequisites

- **Codacy Analysis CLI** (`codacy-analysis`) with `discover` and `init --auto` support. If the CLI does not support these commands, update it running: `npm i -g @codacy/analysis-cli`. See `codacy-analysis-cli` for setup.
- **Codacy Cloud CLI** (`codacy`) — needed to know if the repo is on Codacy Cloud and if so, fetch issues from the cloud-only tools. See `codacy-cloud-cli` for setup.

Both CLIs share credentials at `~/.codacy/credentials`, so a single login covers both.


## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "Disabling one noisy pattern is safe because the tool has others enabled." | `reference/05-security-guardrail.md` requires every security concern (SQL injection, XSS, path traversal, hardcoded secrets) to keep at least one active pattern. |
| "The repo is one language, so `discover` and `init --auto` are overkill." | do-deal-relay ships TypeScript, Python, SQL, Shell, and Markdown; a single-tool config leaves most files unanalyzed. |
| "Cutting noise means disabling every pattern that fires." | Tune the pattern or exclude the files that trigger it first; disable only when the pattern targets the wrong stack. |
| "The changes can be described in chat." | The skill writes a machine-readable summary of every change; prose is not an audit trail. |

## Red Flags

- [ ] A security pattern is disabled while no other active pattern covers that concern.
- [ ] Patterns are cut before the first `analyze` run provides per-pattern counts.
- [ ] New exclusions are added without checking `.codacy.yml`, which already excludes `migrations/**`, `coverage/**`, and templates.
- [ ] A `Critical` or `High` non-security pattern is disabled instead of excluded from the files that fire it.
- [ ] `.codacy/codacy.config.json` is rewritten with no before/after counts recorded.


## Reference

- [How configuration works](reference/01-how-configuration-works.md)
- [Invocation modes](reference/02-invocation-modes.md)
- [Tailored configuration workflow](reference/03-tailored-configuration-workflow.md)
- [Per-tool tuning tips](reference/04-per-tool-tuning-tips.md)
- [Security guardrail](reference/05-security-guardrail.md)
