# Summary JSON

Write `.codacy/configure-codacy-cloud-summary.json`. `before` values come from the startup baseline; `after` values come from the final overview.

```json
{
  "summary": {
    "enabledPatterns": { "before": 1000, "after": 300 },
    "enabledTools": { "before": 34, "after": 15 },
    "issues": { "before": 7000, "after": 550 },
    "issuesByCategory": {
      "Security": { "before": 56, "after": 89 },
      "ErrorProne": { "before": 140, "after": 123 },
      "CodeStyle": { "before": 3000, "after": 230 }
    },
    "issuesBySeverity": {
      "Critical": { "before": 56, "after": 89 },
      "High": { "before": 140, "after": 123 },
      "Medium": { "before": 900, "after": 210 },
      "Minor": { "before": 5904, "after": 128 }
    }
  },
  "toolChanges": [
    {
      "toolName": "Biome",
      "action": "disabled",
      "reason": "Project uses ESLint9 with local config; Biome is redundant and produced 16K false positives in TypeScript",
      "patternsAffected": 232
    }
  ],
  "patternChanges": [
    {
      "patternId": "Semgrep_python.lang.security.audit.xss.template-injection",
      "toolName": "Semgrep",
      "action": "disabled",
      "reason": "Wrong stack — pattern for Python; project is JavaScript-only",
      "deltaIssues": -45,
      "parameters": []
    }
  ],
  "recommendedPathsToIgnore": [
    {
      "path": "src/generated/**",
      "reason": "Generated code. Recommended to be ignored to avoid uncontrolled issues."
    }
  ],
  "keyImprovements": [
    "Lizard complexity thresholds tuned to match a mature React SPA — 576 fewer noise issues while keeping genuinely complex functions flagged"
  ],
  "conflicts": [
    {
      "toolName": "Biome",
      "conflict": "EnforcedByCodingStandard",
      "codingStandardName": "Default Security Rules",
      "reason": "Whole-tool conflict. Biome is redundant with the project's ESLint9 yet produces most of the noise; disabling the tool was rejected with 409 because a coding standard enforces it."
    }
  ]
}
```

**Field reference**

- **`summary`** — before/after counts. `enabledPatterns`/`enabledTools` count everything enabled on Codacy (supported + cloud-only). `issuesByCategory`/`issuesBySeverity` come from the issue overview's breakdowns (apply the `Error→Critical` / `High→High` / `Warning→Medium` / `Info→Minor` level mapping).
- **`toolName`** (used in `toolChanges`, `patternChanges`, `conflicts`) — the tool's **name as shown by `codacy tools`** (the cloud-side identifier you actually store and act on). Note this can differ from the Analysis CLI config `toolId`.
- **`toolChanges`** — one entry per whole tool enabled or disabled. `action`: `"enabled"` or `"disabled"`. `patternsAffected`: number of patterns in that tool.
- **`patternChanges`** — one entry per individual pattern change within a tool that stays enabled. `action`: `"enabled"`, `"disabled"`, or `"updated"`. `deltaIssues`: change in this pattern's issue count, baseline vs final. `parameters`: array of `{id, before, after}` for tuned parameters, `[]` otherwise. Do not list patterns that were added/removed as part of a whole-tool change — those are covered by `toolChanges`.
- **`recommendedPathsToIgnore`** — array of `{path, reason}`. Recommendations only; nothing is written to the repo.
- **`keyImprovements`** — 3–6 human-readable sentences summarizing the most impactful changes, suitable to present to the user.
- **`conflicts`** — array of changes that were attempted but blocked. `patternId` is **optional**: **omit it for whole-tool conflicts** (e.g. a tool that can't be disabled because a standard enforces it), and **include it for pattern-level conflicts**. `conflict`: `"EnforcedByCodingStandard"` (include `codingStandardName`) or `"ConfigurationFile"`. `reason`: what it reports and the recommended action (edit the coding standard / edit the tool's own config file).


> Extracted from: ../SKILL.md
