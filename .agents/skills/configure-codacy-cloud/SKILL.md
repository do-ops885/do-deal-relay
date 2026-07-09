---
name: configure-codacy-cloud
description: Tunes an existing Codacy Cloud repository's configuration directly on the cloud, without local analysis, by importing the current config, suggesting higher-signal tools and patterns, reanalyzing, and iteratively reducing noise across two tuning passes. Requires the repository to already be on Codacy with at least one finished analysis. Uses the Codacy Analysis CLI only for config-file operations and the Codacy Cloud CLI for everything else. Produces a machine-readable JSON summary of pattern, tool, category, and severity changes plus conflicts and recommended path ignores. Use when the user wants to configure or tune Codacy directly on the cloud, reduce noise on a repository already analyzed by Codacy, optimize cloud patterns and tools, or improve the signal of cloud issues without running local analysis.
license: MIT
metadata:
  author: Codacy
  version: 1.0.0
---

# Configure Codacy (Cloud)

> **Glossary:** See [glossary.md](../../../agents-docs/references/glossary.md) for shared definitions of Codacy concepts (issues, findings, severity, coverage, tools, patterns, etc.).

This skill tunes the Codacy configuration of a repository **directly on Codacy Cloud**, using the cloud as the source of truth. It does **not** run local analysis. It reads the current cloud issue landscape, applies a higher-signal set of tools and patterns, reanalyzes on Codacy, and iteratively cuts noise over two passes — producing a clean, high-signal configuration with a full audit trail of what changed and why.

For the local-first variant that discovers a stack from scratch and runs `codacy-analysis analyze` locally, use the `configure-codacy` skill instead. This skill is for repositories **already on Codacy with a finished analysis** where you want to tune the cloud config in place.

## Workflow

```
Configuration Progress:
- [ ] Startup: verify requirements, capture baseline, import cloud config, split tools
- [ ] First pass: generate + merge config, first noise cut, apply, reanalyze
- [ ] Second pass: evaluate impact, second noise cut, apply, reanalyze
- [ ] Final: capture after metrics, evaluate, emit JSON summary, clean up
```

### Startup

1. **Create the temp directory:**

```bash
mkdir -p .codacy/tmp
```

1. **Capture the baseline overview (the BEFORE reference):**

```bash
codacy issues -O -o json 2>/dev/null > .codacy/tmp/overview-before.json
```

This overview is the source for the BEFORE `issues` total, the `issuesByCategory` and `issuesBySeverity` breakdowns, and per-pattern issue counts and false-positive counts.

**Overview JSON structure** (the output is nested under a top-level `overview` key — do not assume flat field names):

- `.overview.categories[]` → `{ name, total }` — e.g. `Security`, `ErrorProne`, `CodeStyle`. The BEFORE `issues` total is the sum of `.overview.categories[].total`.
- `.overview.levels[]` → `{ name, total }` — these are the **severity** buckets, but named `Error` / `High` / `Warning` / `Info`. Map them to the summary's severity names: **`Error` → `Critical`, `High` → `High`, `Warning` → `Medium`, `Info` → `Minor`**.
- `.overview.patterns[]` → `{ id, title, total }` — per-pattern issue counts, sorted with `jq '.overview.patterns | sort_by(-.total)'`. This is the **primary noise signal**: work the highest-count patterns first.
- `.overview.potentialFalsePositives[]` → `{ name, total }`.

If a given CLI version also surfaces **suggested actions** (patterns accounting for 10%+ of all issues or 3x the average per-pattern count, with ready-to-run disable commands), use them — but do not depend on the field being present; the per-pattern counts above are the reliable signal.

1. **Import the current cloud configuration to a file:**

```bash
rm -f .codacy/remote.config.json
codacy-analysis init --remote <provider> <org> <repo> --config-file .codacy/remote.config.json
```

(`init --remote` refuses to overwrite an existing target file, hence the `rm -f`.) This captures the cloud config for tools the Analysis CLI supports.

1. **Split tools into supported vs cloud-only:**

```bash
# Tools the Analysis CLI can configure via import
codacy-analysis info 2>/dev/null

# Tools currently enabled on Codacy Cloud
codacy tools -o json 2>/dev/null | jq '[.[] | select(.settings.isEnabled == true) | .name]'
```

Any cloud-enabled tool **not** in the `codacy-analysis info` list is **cloud-only** — record it; its patterns must be changed with the Cloud CLI, never via import.

1. **Detect coding-standard lock-in early.** Check which coding standards the repo follows:

```bash
codacy repo -o json 2>/dev/null | jq '.repository.repository.standards'
```

If any are present, expect that some tools/patterns are **enforced** by them and cannot be changed at the repo level. For any tool or pattern you later plan to disable or tune, check its `enabledBy` field **first** — a non-empty `enabledBy` means a coding standard enforces it, so a disable will be rejected with a **409**:

```bash
codacy pattern <toolName> <patternId> -o json 2>/dev/null | jq '.enabledBy' # [] / null ⇒ repo-level (changeable); [{name: ...}] ⇒ standard-enforced (locked)
```

Classify standard-enforced tools/patterns into `conflicts[]` **upfront** rather than discovering them through rejected calls — it avoids wasted trial-and-error and makes the whole noise plan honest about what is actually achievable. Never unlink the standard and never use `--force`.

1. **Record BEFORE counts:**

```bash
# Enabled tools
codacy tools -o json 2>/dev/null | jq '[.[] | select(.settings.isEnabled == true)] | length'

# Enabled patterns for supported tools (from the imported config)
jq '[.tools[].patterns | length] | add' .codacy/remote.config.json
```

For **cloud-only** tools, add their enabled-pattern counts: `codacy patterns <tool> --enabled -o json 2>/dev/null | jq 'length'` per tool — but mind the pagination caveat above: this is capped at 100, so a cloud-only tool with more than 100 enabled patterns will be undercounted. The BEFORE `enabledPatterns` is the sum of the supported-tool count and the cloud-only counts; BEFORE `enabledTools` is the enabled-tool count.

### First pass

1. **Generate a higher-signal auto config:**

```bash
rm -f .codacy/auto.config.json
codacy-analysis init --auto "AllSecurity,ErrorProne,Performance,BestPractice,Compatibility,Critical,High" --config-file .codacy/auto.config.json
```

This filter is deliberately tighter than the local variant's broad set — it favors security, error-prone, and high-severity findings and avoids flooding the cloud with low-value style noise.

1. **Merge the current cloud config into the auto config (union, remote → auto):**

```bash
codacy-analysis config --merge --source .codacy/remote.config.json --dest .codacy/auto.config.json
```

`--dest` is overwritten with the union, so `.codacy/auto.config.json` now holds **both** the patterns already enabled on the cloud (for supported tools) **and** the newly suggested patterns. This is the working config for the import path.

1. **First noise evaluation** against `.codacy/tmp/overview-before.json`. Work through patterns by issue count (highest first), applying the noise-evaluation guidance:

- Start from the overview's suggested actions, per-pattern counts, and false-positive ratios.
- If a noisy pattern is **tunable** via parameters (complexity thresholds like Lizard CCN/NLOC, line-length limits), **raise the parameter** instead of disabling.
- Otherwise, if it is noisy and irrelevant, **disable** it.
- To inspect concrete examples for a pattern before deciding: `codacy issues -p <patternId> -o json 2>/dev/null | jq '.'`.

1. **Apply the changes (dual mechanism):**

- **Supported tools** — edit `.codacy/auto.config.json` (remove patterns to disable; edit `parameters` to tune; remove a tool entry to disable the tool), then import:

```bash
codacy tools --import .codacy/auto.config.json -y
```

- **Cloud-only tools** — change directly with the Cloud CLI:

```bash
codacy pattern <provider> <org> <repo> <tool> <patternId> --disable
codacy pattern <provider> <org> <repo> <tool> <patternId> --parameter threshold=20
codacy patterns <provider> <org> <repo> <tool> --categories CodeStyle --severities Minor --disable-all
codacy tool <provider> <org> <repo> <tool> --disable
```

- If any change is rejected with a **409 conflict** — the pattern/tool is enforced by a Coding Standard, or the tool uses its own Configuration File — **record it in `conflicts[]` and move on**. Never unlink standards and never use `--force`.

1. **Reanalyze and wait:**

```bash
codacy repo --reanalyze-and-wait -o json 2>/dev/null > .codacy/tmp/delta-pass1.json
```

This triggers reanalysis on Codacy, polls until done (up to ~20 min), and returns a delta report of issue changes by pattern, severity, and category. If it times out, note it and proceed.

### Second pass

1. **Refresh the overview and compare to baseline:**

```bash
codacy issues -O -o json 2>/dev/null > .codacy/tmp/overview-pass1.json
```

Read `delta-pass1.json` and compare `overview-pass1.json` against `overview-before.json` to see what the first pass actually changed per pattern, category, and severity.

1. **Second noise evaluation — sharpen the signal:**

- **Reduce remaining noisy patterns** that survived the first pass.
- **Judge the newly enabled patterns:** did they surface *relevant* issues, or noise? Disable patterns that turned out irrelevant for this codebase or that only produced false positives (apply the same caution to Security patterns described in the guidance below).
- **Net-issue guardrail:** one goal of this skill is *fewer, more relevant* results. If the total issue count rose markedly versus the baseline, decide what to cut from the newly enabled set — a final count above the baseline is a red flag **unless** one of these holds: (a) the repo started from a very minimal configuration (some growth is expected and healthy), or (b) the dominant baseline noise is **enforced by a coding standard** and therefore could not be cut from the repo. In case (b), a flat or higher total is an expected outcome, **not** a failure — record the locked patterns/tools in `conflicts[]` with a recommendation to edit the standard, and do **not** over-cut genuinely useful new findings (especially Security) just to force the headline number down. Be smart: keep the high-value new findings, trim the rest.

1. **Apply the changes again** with the same dual mechanism (edit `.codacy/auto.config.json` + `codacy tools --import .codacy/auto.config.json` for supported tools; `codacy pattern`/`patterns`/`tool` for cloud-only). Record any new 409 conflicts in `conflicts[]`.

2. **Reanalyze and wait:**

```bash
codacy repo --reanalyze-and-wait -o json 2>/dev/null > .codacy/tmp/delta-pass2.json
```

### Final

1. **Capture the final picture:**

```bash
codacy issues -O -o json 2>/dev/null > .codacy/tmp/overview-after.json
```

1. **Record AFTER counts:** enabled tools from `codacy tools -o json` (enabled count); enabled patterns as the sum of supported-tool patterns in `.codacy/auto.config.json` plus cloud-only enabled patterns (per-tool `codacy patterns <tool> --enabled` count — capped at 100, see the pagination caveat); issue total and the category/severity breakdowns from `overview-after.json`. For a tool you could not change (e.g. a standard-enforced tool), carry its BEFORE count forward unchanged rather than re-counting it from the capped patterns list.

2. **Evaluate the results.** If needed, inspect specific tools or patterns to confirm (`codacy patterns <tool> --enabled -o json`, `codacy tool <tool> -o json`). Identify:

- **What went well** — noise reduction, and new *relevant* detections (especially Security).
- **What did not go well** — noisy patterns that could **not** be disabled because the tool uses its own Configuration File, or because they are enforced by a Coding Standard. These go in `conflicts[]`.
- **Recommendations outside patterns** — files or paths that are generating disproportionate or future noise and could be ignored. These go in `recommendedPathsToIgnore[]` as recommendations only. (Cloud file exclusions are applied via a `.codacy.yaml` committed to the default branch — mention this to the user, but do not create or modify any file.)

1. **Write the summary** to `.codacy/configure-codacy-cloud-summary.json` (schema below) and present a concise before/after summary to the user: metrics table (patterns, tools, issues, by category, by severity), key improvements, conflicts that blocked changes, and recommended paths to ignore.

2. **Clean up:**

```bash
rm -rf .codacy/tmp .codacy/remote.config.json .codacy/auto.config.json
```


## Rationalizations

- Skills imported from codacy/codacy-skills open-source repository
- Cross-skill references use relative paths to shared glossary
- All tools documented with CLI flags and JSON output for agent workflows


## Red Flags

- Requires Codacy API token for Cloud operations
- Local analysis may differ from Cloud analysis results
- Tool availability depends on machine dependencies (Docker, language runtimes)


## Reference

- [Prerequisites and requirements](reference/01-prerequisites-and-requirements.md)
- [How this skill works](reference/02-how-this-skill-works.md)
- [Summary JSON](reference/03-summary-json.md)
- [Noise-evaluation guidance](reference/04-noise-evaluation-guidance.md)
- [Per-tool tuning tips](reference/05-per-tool-tuning-tips.md)
