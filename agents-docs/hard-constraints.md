# Hard Constraints - do-deal-relay

## Cost Estimation (delegation threshold: ≥ 12)

| Score | Meaning |
|-------|---------|
| 1–4   | Small — single file, reversible, < 1h |
| 5–8   | Medium — multi-file, some design decisions |
| 9–11  | Large — new surface, cross-cutting changes |
| ≥ 12  | Delegate to Jules — spans new protocol, transport, or large multi-session work |

## Named Constants

```bash
# File size limits (lines)
readonly MAX_LINES_PER_SOURCE_FILE=500
readonly MAX_LINES_PER_SKILL_MD=250
readonly MAX_LINES_AGENTS_MD=200

# Repository Constraints
readonly TRUST_THRESHOLD_MIN=0.0
readonly TRUST_THRESHOLD_MAX=1.0
readonly GLOBAL_CANDIDATE_BUDGET=1000

# Git/PR configuration
readonly MAX_COMMIT_SUBJECT_LENGTH=72
```

## Runtime Safety Constraints (Guard Rails)
Enforced in `worker/lib/guard-rails.ts`.

### Resource Limits
- **Max Deals per Run**: 1000 (`CONFIG.MAX_DEALS_PER_RUN`)
- **Max Payload Size**: 1MB (`CONFIG.MAX_PAYLOAD_SIZE_BYTES`)
- **Rate Limit**: 100 requests per minute

### Data Field Limits
- **Title**: ≤ 200 characters
- **Description**: ≤ 1000 characters
- **Code**: ≤ 50 characters

### Safety Patterns
- **XSS Prevention**: Blocks `<script>`, `javascript:`, `onerror=`, `onload=`.
- **URL Schemes**: Allowed: `https:`. Explicitly blocked: `javascript:`, `data:`, `vbscript:`, `file:`.
- **Control Characters**: Blocks `\x00-\x08`, `\x0B-\x0C`, `\x0E-\x1F`.

## Code Quality Constraints

### Line Count Limits
All source files must be ≤ 500 lines. Files exceeding this limit must be split.

| File Type             | Max Lines | Enforcement |
| --------------------- | --------- | ----------- |
| TypeScript/JavaScript | 500       | FATAL       |
| SKILL.md              | 250       | WARNING     |
| AGENTS.md             | 200       | WARNING     |
| JSON (config)         | 1000      | WARNING     |
| Markdown (docs)       | 1000      | WARNING     |

### Skill Evaluation
All skills in `.agents/skills/` must pass evaluator checks.

| Check      | Requirement                           | Enforcement |
| ---------- | ------------------------------------- | ----------- |
| Structure  | SKILL.md exists with frontmatter      | FATAL       |
| Line Count | ≤250 lines                            | WARNING     |
| Validation | Pass quick_validate.py                | FATAL       |
| Symlinks   | Present in .claude/, .gemini/, .qwen/ | FATAL       |

## Repository Structure Rules

### Root Directory Policy
Only essential configuration files belong in root. All other files MUST use appropriate subfolders.

**Allowed in Root:**
- Standard config files (`package.json`, `tsconfig.json`, `wrangler.jsonc`, etc.)
- Standard documentation (`README.md`, `AGENTS.md`, `CONTRIBUTING.md`, etc.)
- Versioning and License files (`VERSION`, `LICENSE`, `CHANGELOG.md`)

**Required Subfolders:**

| File Type      | Destination               |
| -------------- | ------------------------- |
| Documentation  | `docs/` or `agents-docs/` |
| Reports/Status | `temp/`                   |
| Agent Status   | `temp/`                   |
| Logs           | `temp/`                   |
| Scripts        | `scripts/`                |
| Tests          | `tests/`                  |
| Source Code    | `worker/`                 |
| Plans          | `plans/`                  |
| Skills         | `.agents/skills/`         |

## Shared Hot Files
Files requiring explicit coordination before modification (see `typescript-coding-standards` skill for protocol):
- `worker/config.ts`
- `worker/index.ts`
- `worker/lib/security.ts`
- `worker/routes/referrals.ts`
- `worker/lib/research-agent/fetcher.ts`
- `.github/workflows/*.yml`

## System Infrastructure (13 Quality Gates)
Enforced via `./scripts/quality_gate.sh`:
1. TypeScript compilation
2. Unit tests
3. Validation gate orchestration check
4. Directory organization
5. Build check
6. Prettier format check
7. YAML syntax validation
8. GitHub Actions workflow validation
9. Secret detection
10. Dependency audit (`npm audit`)
11. Skill symlinks integrity
12. Git hooks installation
13. Dependabot configuration validation

## Per-Deal Logic (9 Validation Gates)
Mandatory gates enforced in `worker/validation/pipeline.ts`:
1. `schema_validation`
2. `normalization_verification`
3. `deduplication_check`
4. `source_trust`
5. `reward_plausibility`
6. `expiry_validation`
7. `second_pass_validation`
8. `idempotency_check`
9. `snapshot_hash_verification`

## Git Hooks
### Pre-Push Hook
- **TypeScript Compilation**: Ensures code compiles.
- **Test Suite**: Runs tests.
- **Secret Detection**: Scans for secrets.
- **Main Branch Protection**: Requires explicit confirmation to push to `main`.
