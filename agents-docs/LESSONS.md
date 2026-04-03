
### LESSON-015: Validation Script Edge Cases

**Date**: 2026-04-03
**Component**: Validation / Guard Rails

**Issue**: Validation script had two edge case bugs that caused false failures:

1. **JSON files with spaces in names** were being split incorrectly (e.g., "Main Branch Protection.json" became 3 separate invalid file paths)
2. **False positive secret detection** matching "task-decomposition" as a secret because it contains "sk-"

**Root Cause**:

- Used unquoted `for file in $(find...)` which splits on whitespace
- Used simple substring matching `"sk-"` instead of proper regex for secret keys

**Solution**:

1. **Fixed JSON validation** with proper space handling:
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

2. **Fixed secret detection** with proper regex patterns:
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

**Prevention**:

- **RULE**: Always use `while IFS= read -r` for file loops with `find`
- **RULE**: Use specific regex patterns for secret detection, not substrings
- **RULE**: Test validation scripts with edge cases: spaces, special chars, realistic data
- **RULE**: Use `-E` (extended regex) for complex patterns in grep

**When to Review Validation Scripts**:

- After adding new file types
- When JSON schemas change
- Before major releases
- When CI starts failing unexpectedly
