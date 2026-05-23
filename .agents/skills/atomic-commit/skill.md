# atomic-commit

## Purpose
Enforces atomic, logically isolated commits with conventional commit formatting. Each commit represents a single, testable unit of work that can be understood, reviewed, and reverted independently.

## When to Use
- Every time you commit changes to the repository
- When breaking down large features into reviewable units
- When fixing bugs with minimal scope

## Rules

### Atomic Commit Principles
1. **Single Responsibility**: Each commit addresses one concern only
2. **Testable**: Changes can be verified in isolation
3. **Revertible**: Can be safely reverted without breaking other functionality
4. **Descriptive**: Subject line clearly states what and why

### Conventional Commit Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc. (no code change)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or correcting tests
- `build`: Changes to build system or dependencies
- `ci`: Changes to CI configuration
- `chore`: Maintenance tasks, tooling changes
- `revert`: Reverts a previous commit

**Scope Examples:**
- `worker`, `sdk`, `cli`, `docs`, `ci`, `deps`, `validation`, `security`

**Subject Line Rules:**
- Max 72 characters
- Imperative mood ("add" not "added")
- No period at end
- Lowercase after type/scope

### Pre-Commit Checklist
Before running `ai-commit.sh`:
1. [ ] Stage only related files (`git add -p` for partial staging)
2. [ ] Run quality gates: `./scripts/quality_gate.sh`
3. [ ] Verify no unrelated changes are staged
4. [ ] Ensure tests pass for this specific change

### Anti-Patterns to Avoid
❌ **Mega commits**: Multiple unrelated changes in one commit
❌ **Fixup commits**: "fix typo", "oops", "address review comments" as separate commits
❌ **WIP commits**: "work in progress", "todo", "testing"
❌ **Merge commits**: Use rebase instead (unless preserving history is required)

## Scripts

### Usage
The repository provides `./scripts/ai-commit.sh` for creating compliant commits:

```bash
./scripts/ai-commit.sh --type feat --scope worker --subject "add circuit breaker to discovery pipeline" --body "Implements circuit breaker pattern to prevent cascade failures when deal sources are unavailable. Uses exponential backoff with 5-minute recovery window."
```

### Manual Git Workflow
If using git directly:
```bash
# 1. Stage interactively
git add -p

# 2. Verify staged changes
git diff --staged

# 3. Run quality gates
./scripts/quality_gate.sh

# 4. Commit with conventional format
git commit -m "type(scope): subject" -m "Detailed body explaining what and why"
```

## Integration Points

### With GOAP Workflow
- **Phase 3 (Execute)**: Use atomic commits for each task completion
- **Phase 4 (Synthesize)**: Commit documentation updates separately

### With Quality Gates
Always run `./scripts/quality_gate.sh` before committing:
```bash
./scripts/quality_gate.sh && ./scripts/ai-commit.sh --type fix --subject "resolve null pointer in validation"
```

### With PR Sentinel
The `github-pr-sentinel` skill validates that all commits in a PR follow atomic principles.

## Examples

### Good Commits
```
feat(validation): add reward plausibility gate

Implements heuristic checks for deal reward amounts:
- Flags rewards >10x average for category
- Validates against merchant historical data
- Rejects obvious typos (extra zeros)

Fixes issue #234

fix(worker): handle timeout in fetcher retry logic

Previously, timeouts during retry would cause infinite loop.
Now respects max_retries=3 configuration.

chore(deps): bump @cloudflare/workers-types to 4.20260101.0

Security patch for HTTP parser vulnerability.
```

### Bad Commits (Avoid)
```
fix stuff
updated some files
WIP
merge branch 'main' into feature/new-thing
fix typo in last commit
```

## Related Skills
- `github-pr-sentinel` - Validates commit quality in PRs
- `goap-agent` - Overall development workflow
- `code-review-assistant` - Review guidelines for commits
- `pre-commit` - Automated pre-commit hooks

## Version
1.0.0
