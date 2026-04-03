

### LESSON-015: Validation Script Edge Cases — Using Self-Learning Analysis

**Date**: 2026-04-03
**Component**: Validation / Guard Rails / Self-Learning

**Issue**: Validation script had two edge case bugs that caused false failures:

1. **JSON files with spaces in names** were being split incorrectly (e.g., "Main Branch Protection.json" became 3 separate invalid file paths)
2. **False positive secret detection** matching "task-decomposition" as a secret because it contains "sk-"

**Root Cause**:

- Used unquoted `for file in $(find...)` which splits on whitespace
- Used simple substring matching `"sk-"` instead of proper regex for secret keys
- **Missing**: Initial analysis didn't use self-learning-feedback skill to verify patterns

**Solution**:

1. **Used self-learning-feedback skill** to analyze and document:
   ```bash
   # Analyze the validation failures
   skill self-learning-feedback
   analyze_method: verify_script_patterns
   file: scripts/validate-codes.sh

   # Capture the lesson after fix
   ./scripts/capture_lesson.sh \
     --error-type validation_script_bug \
     --context "Validation script failing on files with spaces and false secret positives" \
     --evidence "Main Branch Protection.json split into 3 files; task-decomposition matched as secret" \
     --fix "Use while IFS= read -r for spaces; grep -rE for proper secret patterns" \
     --prevention "Always use self-learning analysis before committing validation changes"
   ```

2. **Fixed JSON validation** with proper space handling:
   ```bash
   # Before (broken with spaces)
   for file in $(find . -name "*.json" ...); do
       ...
   done

   # After (handles spaces)
   while IFS= read -r file; do
       ...
   done < <(find . -name "*.json" ...)
   ```

3. **Fixed secret detection** with proper regex patterns:
   ```bash
   # Before (false positives)
   grep -r "sk-" ...
   grep -r "ghp_" ...

   # After (precise matching)
   grep -rE "sk-[a-zA-Z0-9]{20,}" ...
   grep -rE "ghp_[a-zA-Z0-9]{36,}" ...
   ```

**Impact**:

- All 9 validation gates now pass cleanly
- No more false positives on filenames with spaces
- Proper secret detection with actual key patterns
- CI pipeline runs successfully
- **Documented in LESSONS.md** for future reference
- **Logged to lessons.jsonl** for automated analysis

**Prevention**:

- **RULE**: Always use `while IFS= read -r` for file loops with `find`
- **RULE**: Use specific regex patterns for secret detection, not substrings
- **RULE**: Test validation scripts with edge cases: spaces, special chars, realistic data
- **RULE**: Use `-E` (extended regex) for complex patterns in grep
- **RULE**: **Apply self-learning-feedback skill** to analyze before documenting lessons
- **RULE**: Update both LESSONS.md (human-readable) and lessons.jsonl (machine-readable)

**When to Review Validation Scripts**:

- After adding new file types
- When JSON schemas change
- Before major releases
- When CI starts failing unexpectedly

**Self-Learning Applied**:

- ✅ Analyzed using self-learning-feedback skill
- ✅ Captured to lessons.jsonl via capture_lesson.sh
- ✅ Documented in LESSONS.md with full context
- ✅ Prevention rules established for future

---

### LESSON-016: GitHub Actions ShellCheck Validation Gap — Local Guard Rails Must Match CI

**Date**: 2026-04-03
**Component**: GitHub Actions / Workflows / Guard Rails

**Issue**: PR failed in CI with ShellCheck errors that local guard rails didn't catch:
1. SC2129: Multiple consecutive redirects to same file not grouped
2. SC2086: Variables not double-quoted (word splitting/globbing)
3. SC2170: Using `-eq` for string comparison instead of `=`

**Root Cause**:

- Local pre-commit hooks didn't run actionlint/shellcheck on workflow files
- `.githooks/pre-commit` only checked for secrets in workflows, skipped validation
- Actionlint wasn't installed locally, so no workflow validation occurred
- Differences between local and CI environments caused "works on my machine" syndrome

**Solution**:

1. **Fixed all ShellCheck errors** in workflow files:
   ```yaml
   # Before (SC2129 violation)
   echo "mergeable=true" >> "$GITHUB_OUTPUT"
   echo "author=$AUTHOR" >> "$GITHUB_OUTPUT"
   echo "base_ref=$BASE_REF" >> "$GITHUB_OUTPUT"

   # After (grouped redirects)
   {
     echo "mergeable=true"
     echo "author=$AUTHOR"
     echo "base_ref=$BASE_REF"
   } >> "$GITHUB_OUTPUT"
   ```

2. **Added Guard Rail 10** to pre-commit hook:
   ```bash
   # GUARD RAIL 10: GitHub Actions Workflow Validation
   if command -v actionlint >/dev/null 2>&1; then
       for file in $FILES; do
           if [[ "$file" == .github/workflows/*.yml ]]; then
               if ! actionlint -oneline -level error "$file" 2>/dev/null; then
                   error "Workflow validation failed: $file"
               fi
           fi
       done
   else
       warning "actionlint not installed - skipping workflow validation"
       echo "   Install: go install github.com/rhysd/actionlint/cmd/actionlint@latest"
   fi
   ```

3. **Fixed all workflow files**:
   - `.github/workflows/auto-merge.yml` - Grouped GITHUB_OUTPUT redirects, quoted variables
   - `.github/workflows/ci.yml` - Grouped GITHUB_STEP_SUMMARY redirects
   - `.github/workflows/dependencies.yml` - Fixed string comparison (`=` not `-eq`)
   - `.github/workflows/deploy-production.yml` - Grouped redirects
   - `.github/workflows/security.yml` - Grouped redirects

**Prevention**:

- ✅ Added actionlint to Guard Rail 10 in pre-commit hook
- ✅ Updated LESSONS.md with this entry
- ✅ CI now passes - all ShellCheck errors resolved
- ✅ Documented installation instructions for actionlint

**Rule for Future Agents**:

> When modifying GitHub Actions workflows, ALWAYS run `actionlint -level error` locally before committing. If actionlint is not installed, install it with: `go install github.com/rhysd/actionlint/cmd/actionlint@latest` or use Docker: `docker run --rm -v $PWD:/repo rhysd/actionlint:latest`

**Files Modified**:
- `.githooks/pre-commit` - Added Guard Rail 10
- `.github/workflows/*.yml` - Fixed all ShellCheck issues
- `agents-docs/LESSONS.md` - Documented lesson
