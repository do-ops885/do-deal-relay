#!/usr/bin/env bash
# scripts/check-err-helpers.sh
#
# CI gate that enforces use of canonical error-shaping helpers from
# worker/lib/errors.ts (`toErrCtx`, `toErrMessage`) and
# worker/lib/sanitize-error.ts (`toError`) over inline instanceof/Error
# ternary patterns.
#
# Migration policy
# ----------------
# Inline patterns are denied in scanned paths. Future code MUST use:
#   - `toErrMessage(err)`        for single-string error shapes (response
#                                bodies, KV write contexts, console.error,
#                                throw-list templates).
#   - `toErrCtx(err)`            for structured-logger context payloads.
#   - `toError(err)`             for Error-instance wrapping (catch-block
#                                narrowing, re-throw normalization).
#
# Deny patterns (POSIX ERE):
#   1. `error instanceof Error ? VARNAME.message : String(VARNAME)` --
#      the message-string form (most common in worker/ response bodies,
#      KV writes, and logger.error second-arg-as-context paths).
#   2. `error instanceof Error ? VARNAME : new Error(String(VARNAME))` --
#      the Error-wrap form (occurs in catch-block narrowing).
#   3. `error: String(VARNAME)` /
#      `err: String(VARNAME)`    --
#      the bare-form-as-property-value (occurred pre-migration in
#      refresh-tokens.ts:430 and rbac.ts:124).
#
# Exempt paths
# ------------
#   - `tests/`                                  (tests may still write
#                                                 parity assertions).
#   - `dist/` and `node_modules/`                (build artifacts).
#   - `*.md` and `*.mdx` files                  (documentation may
#                                                 reference the patterns).
#   - `.audit/`                                 (scratch / fixtures).
#   - `worker/lib/errors.ts`                    (defines helpers).
#   - `bot/lib/errors.ts`                       (mirror).
#   - `worker/lib/sanitize-error.ts`            (defines `toError`).
#
# Override scan paths (for local validation only): override via
# `ERR_HELPERS_SCAN_PATHS=/tmp/violations bash scripts/check-err-helpers.sh`.
#
# Exit code:
#   0 = no violations found.
#   1 = at least one violation found, with file:line traceback.
#   2 = invalid invocation (e.g., not in repo).

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$REPO_ROOT"

# Default scan paths (relative to repo root).
DEFAULT_SCAN_PATHS=(
  "worker/lib"
  "worker/routes"
  "scripts"
  "bot"
)

# Allow override for local validation (see file header).
if [ -n "${ERR_HELPERS_SCAN_PATHS:-}" ]; then
  # Space-separated list of paths.
  # shellcheck disable=SC2206
  SCAN_PATHS=(${ERR_HELPERS_SCAN_PATHS})
else
  SCAN_PATHS=("${DEFAULT_SCAN_PATHS[@]}")
fi

# Deny patterns. POSIX ERE for portability.
DENY_REGEXES=(
  # Form 1: message-string-ternary (the most common in worker/).
  'error instanceof Error\? [a-zA-Z_]+\.message : String\([a-zA-Z_]+\)'

  # Form 2: Error-wrap-ternary (catch-block narrowing).
  'error instanceof Error\? [a-zA-Z_]+ : new Error\(String\([a-zA-Z_]+\)\)'

  # Form 3a: error-keyed bare String() in object-literal contexts.
  'error: String\([a-zA-Z_]+\)'

  # Form 3b: err-keyed bare String() (a small set of files used `err:` instead of `error:`).
  'err: String\([a-zA-Z_]+\)'
)

# Files matching any of these patterns are exempt.
EXEMPT_PATH_PATTERNS=(
  "tests/"
  "dist/"
  "node_modules/"
  ".audit/"
)

# Files whose basenames exactly match are exempt (helper definitions).
EXEMPT_BASENAMES=(
  "errors.ts"
  "sanitize-error.ts"
)

# Files matching these extensions are exempt (docs).
EXEMPT_EXTENSIONS=(
  ".md"
  ".mdx"
)

violations=0

should_skip() {
  local file="$1"
  for pat in "${EXEMPT_PATH_PATTERNS[@]}"; do
    case "$file" in *"$pat"*) return 0 ;; esac
  done
  local base
  base="$(basename "$file")"
  for exempt in "${EXEMPT_BASENAMES[@]}"; do
    [ "$base" = "$exempt" ] && return 0
  done
  for ext in "${EXEMPT_EXTENSIONS[@]}"; do
    case "$file" in *"$ext") return 0 ;; esac
  done
  return 1
}


# Temp-file-based scanning to avoid ALL process substitution and here-string
# constructs that hang under quality_gate.sh's output=$(eval "$cmd" 2>&1).
# The only safe constructs under command substitution are direct file
# redirection (>, >>, <) and single-process commands. No < <(...), no <<<,
# no pipelines with while-read-on-right-side.

TMP_FILES=$(mktemp)
TMP_HITS=$(mktemp)
trap 'rm -f "$TMP_FILES" "$TMP_HITS"' EXIT

total_files=0
violations=0
processed=0

# 1. Collect files to temp file (single-process find per subdir, NO process sub)
for subdir in "${SCAN_PATHS[@]}"; do
  [ -d "$subdir" ] || continue
  find "$subdir" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.cjs' -o -name '*.mjs' \) 2>/dev/null >> "$TMP_FILES" || true
done

total_files=$(wc -l < "$TMP_FILES")
total_files=$((total_files + 0))  # strip whitespace from wc -l

if [ "$total_files" -eq 0 ]; then
  echo "ERROR: no files found under SCAN_PATHS=${SCAN_PATHS[*]}" >&2
  exit 2
fi

# 2. Scan each file using standard file redirection (safe under command sub)
while IFS= read -r file; do
  [ -z "$file" ] && continue

  if should_skip "$file"; then
    continue
  fi

  # 3. Grep direct-to-file per pattern (no here-strings, no pipelines)
  for pattern in "${DENY_REGEXES[@]}"; do
    > "$TMP_HITS"  # truncate cleanly
    grep -nE "$pattern" "$file" > "$TMP_HITS" 2>/dev/null || true

    if [ -s "$TMP_HITS" ]; then
      while IFS= read -r hit; do
        echo "VIOLATION: $file:$hit  -- use toErrMessage/toErrCtx/toError helper from worker/lib/errors.ts"
        violations=$((violations + 1))
      done < "$TMP_HITS"
    fi
  done

  processed=$((processed + 1))
done < "$TMP_FILES"

echo ""
echo "Scanned: $processed / $total_files files (exempt filtered out)."

if [ "$violations" -gt 0 ]; then
  echo "ERROR: $violations inline error-shaping pattern(s) found." >&2
  echo "       Migration policy (see ADR-014 + commits a9e5a18 / 8e888a6):" >&2
  echo "         string-flatten contexts   -> toErrMessage(err)" >&2
  echo "         structured-logger ctx     -> toErrCtx(err)" >&2
  echo "         Error-instance wrapping   -> toError(err)" >&2
  exit 1
fi

echo "OK: no inline error-shaping patterns found."
exit 0
