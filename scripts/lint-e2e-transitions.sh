#!/usr/bin/env bash
#
# scripts/lint-e2e-transitions.sh
#
# Project-level lint guard against raw `getComputedStyle` usage in E2E tests.
#
# Bash requirement: >= 4.0 (uses `set -euo pipefail`, `read -d ''`,
# `find -print0`, process substitution). GitHub Actions ubuntu-latest ships
# bash 5.x so CI is fine; macOS stock bash 3.2.57 has oddities with
# `read -d ''` -- macOS local devs should `brew install bash` (4.x+) before
# running this script locally to avoid subtle parse errors.
#
# Background: PR #494 / commit `1b323e9` exposed a class of CSS-transition
# flakiness in playwright `expect(getComputedStyle).toMatch()` patterns. The
# `extension/popup.html` `.btn` and `.detection-item` rules include
# `transition: all 0.2s`, so a synchronous `getComputedStyle(boxShadow).toMatch()`
# reads the shadow mid-transition (often `rgba(0,0,0,0)`) and fails. Playwright's
# `await expect(locator).toHaveCSS("box-shadow", /pattern/)` polls through the
# transition and is the idiomatic replacement.
#
# This script is conservative: it flags any *callable* `getComputedStyle(`
# (followed by an opening paren to avoid matching identifiers that just happen
# to contain the substring). Line comments (`// ...` and JSDoc continuations
# `* ...`) are skipped, so the explanatory comments in `popup_a11y.spec.ts`
# that reference the old pattern by name don't false-positive.
#
# Exit codes:
#   0  no raw getComputedStyle found in test code
#   1  one or more violations detected
#
# Wire: `npm run lint:e2e` (added in package.json scripts).

set -euo pipefail

shopt -s globstar nullglob

violations=0

while IFS= read -r -d '' file; do
  # Pull only `getComputedStyle(` invocations, then drop comment lines
  # (line-start `//` or `*` after optional whitespace + leading line number).
  hits=$(awk '
    {
      line = $0
      # Strip leading `^[0-9]+:` prefix that grep -n adds before matching.
      sub(/^[0-9]+:/, "", line)
      # If line is a comment (// ... or * ... inside /* */ block), skip.
      if (line ~ /^[ \t]*(\/\/|\*)/) next
      # If line contains a literal `getComputedStyle(`, that is a real call.
      # Also flag bracket-string lookups e.g. `window['getComputedStyle']`
      # or `window["getComputedStyle"]` -- same flakiness profile.
      if (line ~ /(getComputedStyle\(|\[[\"'\'']getComputedStyle[\"'\'']\])/) print FILENAME ":" NR ":" $0
    }
  ' "$file")
  if [ -n "$hits" ]; then
    echo "$hits"
    violations=$((violations + 1))
  fi
done < <(find tests/browser -type f -name '*.spec.ts' -print0)

if [ "$violations" -gt 0 ]; then
  cat <<'EOF' >&2

ERROR: raw getComputedStyle() in E2E test code (lint guard tripped).

Why:  .btn / .detection-item in extension/popup.html declare
       `transition: all 0.2s`. A synchronous read of the focus-ring
       box-shadow can capture rgba(0,0,0,0) mid-transition and fail-close.

Fix:   Replace with Playwright's auto-retrying `toHaveCSS` instead:
         await expect(locator).toHaveCSS('box-shadow', /pattern/)

Ref:   PR #494 commit 1b323e9 (`test(e2e): use toHaveCSS for box-shadow
       focus ring assertions`).
EOF
  exit 1
fi

echo "OK: no raw getComputedStyle invocations in tests/browser/*.spec.ts"
