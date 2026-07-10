# Per-tool tuning tips

- **Semgrep** — ships patterns for 30+ languages; disabling patterns for languages not in the repo is usually the single biggest noise reduction. Cross-reference the pattern ID prefix (e.g. `python.`, `javascript.`, `java.`).
- **Lizard (complexity)** — has CCN, NLOC, and parameter-count rules with configurable `threshold` parameters. For mature codebases, raise the medium thresholds to match the project's profile rather than disabling, to preserve visibility into genuinely complex code.
- **ESLint9 / Stylelint** — if the repo has its own config file and uses it on Codacy, the tool runs in Configuration File mode; its patterns cannot be changed from Codacy (these show up as `ConfigurationFile` conflicts). Note this to the user — noise must be reduced in the project's own config.
- **markdownlint** — rules like MD033 (inline HTML), MD034 (bare URLs), MD024 (duplicate headings) fire heavily on changelogs and generated docs. These are stylistic; recommend ignoring the noisy paths rather than keeping the noise.


> Extracted from: ../SKILL.md
