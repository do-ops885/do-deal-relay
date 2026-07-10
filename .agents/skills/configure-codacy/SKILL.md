---
name: configure-codacy
description: Tailors Codacy configuration to a project by discovering its stack, enabling the right tools and patterns, running analysis, and intelligently reducing noise — disabling irrelevant or noisy patterns, tuning thresholds, and excluding files that shouldn't be analyzed. Produces a machine-readable summary of all changes. Use whenever the user wants to configure Codacy, reduce noise, fix false positives, enable or disable tools or patterns, tune code quality rules, deal with too many warnings, or align Codacy with their project's conventions. Also trigger when the user complains about irrelevant issues, noisy linters, or wants to set up Codacy for the first time on a repo.
license: MIT
metadata:
  author: Codacy
  version: 4.3.0
---

# Configure Codacy

> **Glossary:** See [glossary.md](../../../agents-docs/references/glossary.md) for shared definitions of Codacy concepts (issues, findings, severity, coverage, tools, patterns, etc.).

This skill tailors Codacy configuration to a project's actual stack and coding conventions. It discovers the repository's languages and frameworks, initializes a broad set of tools and patterns, runs analysis, then intelligently cuts noise — producing a clean, high-signal configuration with a full audit trail of what changed and why.

## Prerequisites

- **Codacy Analysis CLI** (`codacy-analysis`) with `discover` and `init --auto` support. If the CLI does not support these commands, update it running: `npm i -g @codacy/analysis-cli`. See `codacy-analysis-cli` for setup.
- **Codacy Cloud CLI** (`codacy`) — needed to know if the repo is on Codacy Cloud and if so, fetch issues from the cloud-only tools. See `codacy-cloud-cli` for setup.

Both CLIs share credentials at `~/.codacy/credentials`, so a single login covers both.


## Rationalizations

- Skills imported from codacy/codacy-skills open-source repository
- Cross-skill references use relative paths to shared glossary
- All tools documented with CLI flags and JSON output for agent workflows


## Red Flags

- Requires Codacy API token for Cloud operations
- Local analysis may differ from Cloud analysis results
- Tool availability depends on machine dependencies (Docker, language runtimes)


## Reference

- [How configuration works](reference/01-how-configuration-works.md)
- [Invocation modes](reference/02-invocation-modes.md)
- [Tailored configuration workflow](reference/03-tailored-configuration-workflow.md)
- [Per-tool tuning tips](reference/04-per-tool-tuning-tips.md)
- [Security guardrail](reference/05-security-guardrail.md)
