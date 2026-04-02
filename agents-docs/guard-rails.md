## Guard Rails (Safety Mechanisms)

### Overview

Guard rails are automated safety checks that prevent the system from:

- Processing malicious data
- Exceeding resource limits
- Producing inconsistent results
- Violating security policies
- Creating files in incorrect locations
- **Exceeding code quality standards (NEW)**

### Code Quality Guard Rails (NEW)

**LINE COUNT LIMIT**: All source files must be ≤500 lines. Files exceeding this limit must be split.

| File Type             | Max Lines | Enforcement |
| --------------------- | --------- | ----------- |
| TypeScript/JavaScript | 500       | FATAL       |
| JSON (config)         | 1000      | WARNING     |
| Markdown (docs)       | 1000      | WARNING     |

#### Pre-Commit Line Count Check

```bash
# Check all staged files
for file in $(git diff --cached --name-only | grep -E '\.(ts|js)$'); do
  lines=$(wc -l < "$file")
  if [ $lines -gt 500 ]; then
    echo "ERROR: $file exceeds 500 lines ($lines lines)"
    echo "Split this file into smaller modules"
    exit 1
  fi
done
```

**SKILL EVALUATION**: All skills in `.agents/skills/` must pass evaluator checks.

| Check      | Requirement                           | Enforcement |
| ---------- | ------------------------------------- | ----------- |
| Structure  | SKILL.md exists with frontmatter      | FATAL       |
| Line Count | ≤250 lines                            | WARNING     |
| Validation | Pass quick_validate.py                | FATAL       |
| Symlinks   | Present in .claude/, .gemini/, .qwen/ | FATAL       |

#### Skill Validation

```bash
# Validate all skills
for skill in .agents/skills/*/; do
  python3 .agents/skills/skill-creator/scripts/quick_validate.py "$skill"
  if [ $? -ne 0 ]; then
    echo "ERROR: Skill validation failed for $skill"
    exit 1
  fi
done
```

### Pre-Push Hook Guard Rails

The pre-push hook runs automatically when `git push` is executed. It performs the following checks:

| Guard Rail             | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| TypeScript Compilation | Ensures code compiles before pushing              |
| Test Suite             | Runs tests and verifies they pass                 |
| Validation Script      | Executes `./scripts/validate-codes.sh` if present |
| Secret Detection       | Scans for potential secrets in staged changes     |
| Branch Name            | Validates branch follows naming conventions       |
| Recent Commits         | Checks for WIP/temporary commits                  |

#### Main Branch Protection

When pushing to `main` or `master`, the hook enforces special handling:

```
⚠️  Direct push to main branch detected

Recommended workflow: Use feature branches for changes

Options:
  1. Cancel and use: git checkout -b feature/xxx && git push -u origin feature/xxx
  2. Type 'I understand pushing to main' to continue with main push
  3. Use --no-verify to bypass all checks (not recommended)

Enter your choice (or type the confirmation phrase):
```

**Confirmation Flow:**

1. User types exact phrase: `I understand pushing to main`
2. Push is ALLOWED to proceed
3. Event is logged to `temp/main-push-audit.log`

**Blocked Flow:**

1. User enters anything else or cancels
2. Push is BLOCKED
3. Attempt is logged to `temp/main-push-audit.log`

**Audit Log Format:**

```
[2026-04-01T12:34:56+00:00] AUTHORIZED main push by user@example.com from branch: main, remote: refs/heads/main
[2026-04-01T12:35:12+00:00] BLOCKED main push attempt by user@example.com from branch: main, remote: refs/heads/main, input: 'no'
```

#### Hook Locations

- **Active Hook**: `.git/hooks/pre-push` (Git-managed, auto-installed on clone)
- **Canonical Version**: `.githooks/pre-push` (project source)
- **Standalone Script**: `scripts/pre-push-hook.sh` (for manual execution)

To install the canonical hook manually:

```bash
cp .githooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

To bypass all checks (use sparingly):

```bash
git push --no-verify
```

### File Organization Guard Rails

**ROOT DIRECTORY POLICY**: Only essential configuration files belong in root. All other files MUST use appropriate subfolders.

#### Allowed in Root (Standard Project Files)

```
.gitignore          # Git ignore patterns
package.json        # NPM manifest
package-lock.json   # NPM lockfile
tsconfig.json       # TypeScript config
vitest.config.ts    # Test runner config
wrangler.toml       # Cloudflare Workers config
README.md           # Main project documentation
QUICKSTART.md       # Quick start guide
CONTRIBUTING.md     # Contribution guidelines
SECURITY.md         # Security policy
AGENTS.md           # Agent coordination hub
CLAUDE.md           # Claude CLI spec
GEMINI.md           # Gemini CLI spec
QWEN.md             # Qwen CLI spec
VERSION             # Version file
LICENSE             # License file (if present)
CHANGELOG.md        # Changelog for releases
```

#### Required Subfolder Usage

| File Type      | Destination               | Examples                                                      |
| -------------- | ------------------------- | ------------------------------------------------------------- |
| Documentation  | `docs/` or `agents-docs/` | System docs, API docs                                         |
| Reports/Status | `temp/`                   | Deployment reports, readiness checks                          |
| Agent Status   | `temp/`                   | state.json, progress files                                    |
| Logs           | `temp/`                   | Generated logs                                                |
| Analysis       | `temp/`                   | Swarm analysis, generated reports                             |
| Scripts        | `scripts/`                | Shell scripts, utilities                                      |
| Tests          | `tests/`                  | Test files                                                    |
| Source Code    | `worker/`                 | Worker implementation                                         |
| Plans          | `plans/`                  | Execution plans, warning/issue tracking, production readiness |
| Skills         | `.agents/skills/`         | Agent coordination                                            |

#### Enforcement Rules

- **FATAL**: Creating non-essential files in root directory
- **FATAL**: Duplicating files across multiple locations
- **WARNING**: Temporary files not in `temp/`
- **WARNING**: Documentation not in `docs/` or `agents-docs/`

#### Pre-Commit Check

```bash
# Verify no new files in root
if git diff --cached --name-only | grep -E "^[^/]+$" | grep -v -E "^\.(git|gitignore)|package(-lock)?\.json|tsconfig\.json|vitest\.config\.ts|wrangler\.toml|README\.md|CHANGELOG\.md|VERSION|LICENSE$"; then
  echo "ERROR: Files added to root directory. Move to appropriate subfolder."
  exit 1
fi
```

### Implementation

Guard rails are implemented in `worker/lib/guard-rails.ts` and enforced at:

1. **Input stage** - Resource limits, payload validation
2. **Processing stage** - Safety checks, XSS prevention
3. **Output stage** - Data quality, consistency checks

### Guard Rail Types

#### Safety Guard Rails

- **XSS Prevention**: Detects `<script>`, `javascript:`, `onerror=` patterns
- **URL Validation**: Blocks dangerous schemes (javascript:, data:, vbscript:)
- **URL Completeness**: Enforces complete URLs with protocol (see [url-handling.md](./url-handling.md))
- **Control Character Detection**: Prevents injection of control chars

#### Resource Guard Rails

- **Deal Count Limit**: Max 1000 deals per run (CONFIG.MAX_DEALS_PER_RUN)
- **Payload Size**: Max 1MB per request (CONFIG.MAX_PAYLOAD_SIZE_BYTES)
- **Field Length**: Title ≤200, Description ≤1000, Code ≤50 chars

#### Rate Limiting

- **Request Window**: 100 requests per minute
- **Automatic Reset**: Window expires after 1 minute
- **Graceful Degradation**: Returns 429 Too Many Requests

#### Quality Guard Rails

- **Required Fields**: Code, Title, URL must be present
- **URL Validity**: All URLs must be parseable
- **Duplicate Detection**: Tracks duplicate codes
- **Anomaly Detection**: Flags rewards >5× average or >$1000

#### Consistency Guard Rails

- **Count Validation**: Deal count should not increase after deduplication
- **Data Loss Detection**: Flags if >50% of deals disappear
- **Hash Integrity**: Tracks deals through pipeline stages

### Enforcement

```typescript
// Run checks
const report = await runGuardRails(deals, "processing");

// Enforce (throws on fatal errors)
await enforceGuardRails(deals, "output");
```

### Error Handling

**Fatal Errors** (block execution):

- XSS detected
- Resource limits exceeded
- Invalid data quality
- Consistency violations
- Non-essential files in root directory

**Warnings** (logged, don't block):

- Duplicate codes
- High reward values
- Data loss >20%

### Pre-Commit Check

```bash
# Run validation manually
./scripts/validate-codes.sh

# Git hook runs automatically on commit
```

### Best Practices

1. **Always run guard rails** before publishing
2. **Log all violations** for audit trail
3. **Alert on fatal errors** via notification system
4. **Review warnings** periodically for patterns
5. **Update patterns** as new threats emerge
6. **NEVER create files in root** - always use appropriate subfolders
7. **Keep root clean** - only standard config files belong there

### Integration

Guard rails are automatically integrated into:

- State machine (before each stage transition)
- API endpoints (input validation)
- Publish flow (pre-publication check)
- Validation gates (additional safety layer)
