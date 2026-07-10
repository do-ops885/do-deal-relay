# How configuration works

All configuration is done locally via `.codacy/codacy.config.json`. Edit the file, run analysis, see results instantly — no push or cloud reanalysis needed. Once tuned, the configuration can be imported to Codacy Cloud in one step.

The key principle: **start broad, then cut noise using data**. Initialize with maximum pattern coverage via `init --auto`, run analysis to see the full issue landscape, then use the severity/category distribution to decide what to disable or tune.

Read [the config format reference](../codacy-analysis-cli/references/config-format.md) for the full schema before editing — field names matter (e.g., the exclusion field is `exclude`, not `excludePaths`). To disable a pattern, remove it from the `patterns` array. To disable a tool, remove the entire tool entry.

**Organization standards take precedence.** If a pattern is enforced by a Coding Standard at the organization level, it cannot be changed at the repository level.

**Local config only.** The `.codacy/codacy.config.json` file is used exclusively for local analysis. Committing or pushing it to the repository has NO effect on Codacy Cloud analysis. To apply the configuration to Codacy Cloud, use the import command (`codacy tools ... --import`).


> Extracted from: ../SKILL.md
