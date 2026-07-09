# How Codacy data works

- **Data reflects the HEAD commit** — issue lists, coverage, and security findings always show the state of the latest analyzed commit on the branch or pull request. There is no per-file or per-line historical view.
- **Configuration changes are not instant** — enabling/disabling tools or patterns, changing parameters, and ignoring issues only take effect after the next analysis. That means either triggering a reanalysis via `--reanalyze` or waiting for the next commit to be pushed.
- **Organization standards are enforced and cannot be overridden at repository level** — if a pattern is enforced by a Coding Standard at the organization level, its enabled/disabled state and parameters cannot be changed per-repository. To change it, the standard must be updated at the organization level.

### Reanalysis

Use `--reanalyze-and-wait` (`-w`) on the `repository` or `pull-request` commands to trigger reanalysis and block until it completes. The CLI captures a baseline, triggers reanalysis, polls every 10 seconds (up to 20 minutes), and reports issue deltas by pattern, severity, and category with timing information. Supports `--output json` for machine-readable delta reports.

```bash
# Trigger reanalysis and wait for results (preferred)
codacy repository gh my-org my-repo --reanalyze-and-wait
codacy repository gh my-org my-repo -w -o json # JSON delta report

# Fire-and-forget reanalysis (no waiting)
codacy repository gh my-org my-repo --reanalyze
```

When using `--reanalyze` without `--and-wait`, check progress manually by re-running the command without `--reanalyze`:

- **Table output:** look at the "Analysis" field — `"Reanalysis in progress..."` means it is still running; `"Finished X ago"` means it is done
- **JSON output:** compare the `startedAnalysis` and `endedAnalysis` timestamps — complete when `startedAnalysis` > trigger time AND `endedAnalysis` > `startedAnalysis`


> Extracted from: ../SKILL.md
