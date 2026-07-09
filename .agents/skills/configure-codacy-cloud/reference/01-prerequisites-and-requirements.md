# Prerequisites and requirements

- **Codacy Cloud CLI** (`codacy`) — drives all cloud reads, updates, and reanalysis. See `codacy-cloud-cli` for setup.
- **Codacy Analysis CLI** (`codacy-analysis`) — used **only** for config-file operations (`init --remote`, `init --auto`, `config --merge`). See `codacy-analysis-cli` for setup.
- Both CLIs share credentials at `~/.codacy/credentials`, so a single login covers both.

This skill has **two hard requirements**. Verify both before doing anything else and stop with clear guidance if either fails:

1. **The repository is already on Codacy.** Confirm with:

```bash
codacy repo --output json
```

If this fails (not on Codacy, no auth), stop. Tell the user to add the repo to Codacy first (e.g. `codacy repo --add`) — this skill does not set up a new repository.

1. **The repository has at least one finished analysis.** Inspect the `codacy repo --output json` output for a completed/last-analysis indicator, and confirm the issue overview returns data:

```bash
codacy issues -O -o json 2>/dev/null | jq '.'
```

If the repo was never analyzed, or analysis is still running, stop. Tell the user to wait for the first analysis to finish — the whole flow depends on cloud issue data as the baseline.

The Cloud CLI auto-detects `provider`, `organization`, and `repository` from the git remote when run inside the repo, so the explicit `<provider> <org> <repo>` arguments shown below are optional in practice.

**CLI output caveat:** both CLIs print progress lines to stderr before their JSON output. When piping to `jq`, redirect stderr: `codacy ... -o json 2>/dev/null | jq '...'`.

**`codacy patterns` pagination caveat:** `codacy patterns <tool> [--enabled]` currently returns only the **first 100 patterns** and has **no `--limit` flag** (one is planned — until then, assume the list is truncated at 100). Never use the length of its output as a pattern count: for a tool whose enabled set exceeds 100 you will silently see only 100, which reads as a phantom "reduction" (e.g. a tool that actually has 232 enabled patterns appears to have "100"). To check or test a **specific** pattern, filter by id with `--search <patternId>` or query the single pattern with `codacy pattern <tool> <patternId> -o json`. For accurate enabled-pattern **counts**, derive them from the config file (`jq '[.tools[].patterns|length]|add' .codacy/auto.config.json`) rather than the patterns list.

**Local config is untouched.** This skill works through custom `--config-file` paths (`.codacy/remote.config.json`, `.codacy/auto.config.json`) and **never creates or modifies `.codacy/codacy.config.json`**. Any existing local config is left intact.


> Extracted from: ../SKILL.md
