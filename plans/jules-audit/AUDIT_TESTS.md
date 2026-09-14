# Test Coverage Audit (Track C)

## Uncovered Logic Identified
- `extractContent` in `worker/pipeline/discover-parsers.ts`: Content caching and window slicing edge cases (empty code, code absent, memoization hit).

## Tests Added
- `tests/unit/discover.parsing.test.ts`: Added tests for `extractContent` edge cases (code not found in content, caching memoization verification, and custom window bounds).
