# Skills Audit Report - June 2026

## Overview
This audit examines the `.agents/skills/` directory for redundancy, misleading content, and consolidation opportunities.

## Findings

### 1. Deleted Redundant Skills
The following skills were deleted as they were superseded by the canonical `cloudflare` reference tree:
- `wrangler`
- `workers-best-practices`
- `web-doc-resolver` (Superseded by `web-search-researcher` and `cloudflare` references)
- `evals` (Superseded by `skill-evaluator`)

### 2. Consolidation Opportunity: Codacy Cluster
There are five distinct Codacy-related skills that overlap significantly.
- **Current Skills**:
  - `codacy-analysis-cli`
  - `codacy-cloud-cli`
  - `codacy-code-review`
  - `configure-codacy`
  - `configure-codacy-cloud`
- **Recommendation**:
  - Merge into `codacy-cli` (Local analysis & CLI usage).
  - Merge into `codacy-setup` (Cloud configuration, standards, and setup), folding `codacy-code-review` into this as a section.

### 3. Misleading or Inconsistent Structures
- **Duplicate Reference Folders**: `skill-creator` contains both `reference/` and `references/`. These should be merged into a single `references/` directory for consistency.
- **Template Shells**: `configure-codacy` and `configure-codacy-cloud` are currently thin shells containing only a `SKILL.md` with high boilerplate. Consolidating these will improve signal-to-noise ratio.

### 4. Specialized Skills (Keep as is)
The following specialized skills were reviewed and found to be high-value with distinct scopes, even if they overlap with broader categories:
- `turnstile-spin`: High-value wizard for Turnstile integration.
- `durable-objects`: Deep implementation details for stateful Workers.
- `crypto-utils`: Focused cryptographic helpers.

## Next Steps
1. Consolidate Codacy cluster into `codacy-cli` and `codacy-setup`.
2. Normalize `skill-creator` folder structure.
3. Monitor `skill-evaluator` usage to ensure it fully replaces the functionality of the deleted `evals` skill.
