# How this skill works

The key principle is the same as the local variant: **start from a higher-signal set, then cut noise using data** — but every measurement and every change happens on Codacy Cloud.

Tools fall into two groups, and changes are applied through **two different mechanisms**:

- **Tools supported by the Analysis CLI** (those listed by `codacy-analysis info`, see [supported-tools.md](../codacy-analysis-cli/references/supported-tools.md)) are configured by editing the `.codacy/auto.config.json` file and importing it: `codacy tools --import .codacy/auto.config.json`. The import **reconciles supported tools to the file's contents**: a supported tool present in the file has its patterns replaced by the file's, and a supported tool **absent** from the file is **disabled** by the import (you will see `N tool will be disabled: ...` in the import plan). **Cloud-only tools** — those outside the Analysis CLI's scope — are never in the file and keep their state.

- **Cloud-only tools** (enabled in Codacy but not runnable by the Analysis CLI, e.g. SonarSharp, Codacy ScalaMeta Pro) cannot be configured via the import. Change them directly with the Cloud CLI: `codacy tool`, `codacy pattern`, `codacy patterns`.

**Cloud tool name vs config `toolId`.** The Cloud CLI commands (`codacy tool`, `codacy pattern`, `codacy patterns`) address tools by their **cloud name** as shown by `codacy tools` — which for some tools **differs** from the Analysis CLI config `toolId`. The clearest case: the config `toolId` is `Semgrep`, but the cloud tool is named `Opengrep`, so `codacy patterns Semgrep` fails with `Tool "Semgrep" not found` while `codacy patterns Opengrep` works. When a Cloud CLI command reports a tool as not found, check the name in `codacy tools -o json` and use that. (The import path, which keys by `toolId`, is unaffected.)

Read [the config format reference](../codacy-analysis-cli/references/config-format.md) before editing `auto.config.json`. Its shape: a top-level `tools[]` array where each entry is keyed by **`toolId`** (e.g. `"Biome"`, `"Semgrep"`, `"ESLint9"`) and holds a `patterns[]` array whose entries are keyed by **`patternId`** with an optional **`parameters`** object — there is **no** `uuid`, `name`, or `enabled` key on these entries, so filter and edit by `toolId` / `patternId`. To disable a pattern, remove it from the `patterns` array; to tune one, edit its `parameters`; to disable a tool, remove the whole tool entry.


> Extracted from: ../SKILL.md
