#!/usr/bin/env bash
# goap-reverify.sh - Enforce AGENTS.md Re-Verification Protocol for deferred tasks.
#
# Severity model (matches the steering-loop escalation in HARNESS.md):
#   <= 30d since last verification: PASS
#   30-60d:                          WARN  (auto-flagged, log to LEARNINGS)
#   60-90d:                          FAIL  (escalate to hard constraint)
#   > 90d:                           CRITICAL (immediate roadblock)
#
# Hybrid age detection:
#   1. Look for an explicit re-verified marker in the file
#      (matches `re_verified: YYYY-MM-DD`, `## Re-verified: YYYY-MM-DD`,
#       or `**Re-verified:** YYYY-MM-DD`).
#   2. Fall back to `git log -1 --format=%at <file>` for last commit timestamp.
#   3. Final fallback to file mtime.
#
# Usage:
#   ./scripts/goap-reverify.sh         # full human report
#   ./scripts/goap-reverify.sh --json  # structured for tooling
#   ./scripts/goap-reverify.sh --dry-run
#   ./scripts/goap-reverify.sh --help

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLANS_DIR="${ROOT_DIR}/plans"

# Modes
JSON=false
DRY_RUN=false
VERBOSE=false

# Counters (defensive `: $((X++))` to avoid pre-increment-zero trap)
PASSES=0; WARNINGS=0; FAILURES=0; CRITICALS=0
NEEDS_REVERIFICATION=()
REVERIFIED_RECENTLY=()

# Color codes
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
MAGENTA='\033[1;35m'; CYAN='\033[0;36m'; NC='\033[0m'

# Parse args
for arg in "$@"; do
  case "$arg" in
    --json) JSON=true ;;
    --verbose|-v) VERBOSE=true ;;
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      sed -n '2,/^set -uo/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# JSON mode: redirect human stdout to stderr, save FD 3 for the JSON block.
if $JSON; then
  exec 3>&1
  exec 1>&2
fi

# ── Logging (gated by JSON/DRY-RUN) ───────────────────────────────
info() { $JSON && return 0; $DRY_RUN && return 0; echo -e "$@"; }
ok()   { : $((PASSES++));    $JSON && return 0; $DRY_RUN && return 0; echo -e "  ${GREEN}✓${NC} $1"; }
warn() { : $((WARNINGS++));  $JSON && return 0; $DRY_RUN && return 0; echo -e "  ${YELLOW}!${NC} $1"; }
fail() { : $((FAILURES++));  $JSON && return 0; $DRY_RUN && return 0; echo -e "  ${RED}✗${NC} $1"; }
crit() { : $((CRITICALS++)); $JSON && return 0; $DRY_RUN && return 0; echo -e "  ${MAGENTA}☢${NC} $1"; }

# ── helpers ──────────────────────────────────────────────────────
# Get age in days for a file using the hybrid strategy.
# Echoes a single integer (days since most recent verification).
get_file_age_days() {
  local target="$1"
  local current_ts last_ts explicit_ts marker_date

  current_ts=$(date +%s)

  # 1. Explicit marker override (front-matter or H2/bold line with ISO date)
  marker_date=$(grep -m1 -Ei '^(re_verified:|## Re-verified:|\*\*Re-verified:\*\*)' "$target" 2>/dev/null \
                | grep -Eo '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 || true)
  if [[ -n "$marker_date" ]]; then
    # GNU date (-d) preferred; macOS fallback (-j -f) handled if available
    explicit_ts=$(date -d "$marker_date" +%s 2>/dev/null \
                   || python3 -c "from datetime import date; from time import mktime; print(int(mktime(date('$marker_date').timetuple())))" 2>/dev/null \
                   || echo "")
    if [[ -n "$explicit_ts" ]] && (( explicit_ts > 0 )); then
      echo "$(( (current_ts - explicit_ts) / 86400 ))"
      return 0
    fi
  fi

  # 2. Fallback: last commit touching the file in git
  last_ts=$(git log -1 --format=%at -- "$target" 2>/dev/null || true)
  [[ -z "$last_ts" ]] && last_ts=$(stat -c %Y "$target" 2>/dev/null || stat -f %m "$target" 2>/dev/null || echo "")

  if [[ -z "$last_ts" ]] || (( last_ts <= 0 )); then
    echo "-1"
    return 0
  fi

  echo "$(( (current_ts - last_ts) / 86400 ))"
}

# ── Phase 1: Discovery ────────────────────────────────────────────
info "\n${CYAN}=== GOAP DEFERRAL RE-VERIFICATION SCAN ===${NC}"

mapfile -t FOLLOWUP_FILES < <(find "$PLANS_DIR" -maxdepth 1 -name 'FOLLOWUP-*.md' -type f 2>/dev/null | sort || true)
GOAP_STATE_FILE="${PLANS_DIR}/GOAP_STATE.md"

# Targets = all FOLLOWUP plans + GOAP_STATE.md if it has any structured "deferred" rows
ALL_TARGETS=("${FOLLOWUP_FILES[@]}")
if [[ -f "$GOAP_STATE_FILE" ]] && \
   grep -qE '\|.*(⬜|deferred).*\|' "$GOAP_STATE_FILE" 2>/dev/null; then
  ALL_TARGETS+=("$GOAP_STATE_FILE")
fi

if [[ ${#ALL_TARGETS[@]} -eq 0 ]]; then
  info "${GREEN}  No deferred items found. Harness healthy.${NC}"
fi

# ── Phase 2 + 3: Scan and classify ────────────────────────────────
for file in "${ALL_TARGETS[@]}"; do
  [[ ! -f "$file" ]] && continue
  rel="${file#${ROOT_DIR}/}"
  age=$(get_file_age_days "$file")

  # Build a JSON record (string assembly; printf-quoted paths so commas in titles stay safe)
  json_age="\"age_days\": ${age:-\"\"}"

  if [[ "$age" == "-1" ]]; then
    # Could not determine age — treat as WARN (cannot verify freshness)
    warn "${rel} — UNKNOWN AGE (no git history, no marker). Cannot verify freshness."
    NEEDS_REVERIFICATION+=("{\"path\": \"${rel}\", ${json_age}, \"status\": \"unknown\", \"recommendation\": \"Add explicit re_verified: marker\"}")
  elif (( age <= 30 )); then
    ok "${rel} (${age}d) \u2014 within 30d freshness window"
    REVERIFIED_RECENTLY+=("{\"path\": \"${rel}\", ${json_age}, \"status\": \"fresh\"}")
  elif (( age <= 60 )); then
    warn "${rel} (${age}d) \u2014 >30d stale. Auto-flagged for review."
    NEEDS_REVERIFICATION+=("{\"path\": \"${rel}\", ${json_age}, \"status\": \"stale\", \"recommendation\": \"Spawn lightweight re-verification agent\"}")
  elif (( age <= 90 )); then
    fail "${rel} (${age}d) \u2014 >60d. Escalate via LEARNINGS, hard constraint cascade."
    NEEDS_REVERIFICATION+=("{\"path\": \"${rel}\", ${json_age}, \"status\": \"fail\", \"recommendation\": \"Mandatory verification before next plan execution\"}")
  else
    crit "${rel} (${age}d) \u2014 >90d CRITICAL. Immediate roadblock resolution required."
    NEEDS_REVERIFICATION+=("{\"path\": \"${rel}\", ${json_age}, \"status\": \"critical\", \"recommendation\": \"Roadblock; address immediately\"}")
  fi
done

# ── Phase 4: JSON output ─────────────────────────────────────────
if $JSON; then
  exec 1>&3  # Restore stdout for JSON emission
  exec 3>&-
  printf '{\n'
  printf '  "totals": { "passes": %d, "warnings": %d, "failures": %d, "critical": %d },\n' \
    "$PASSES" "$WARNINGS" "$FAILURES" "$CRITICALS"
  printf '  "reverified_recently": [\n'
  if [[ ${#REVERIFIED_RECENTLY[@]} -gt 0 ]]; then
    for i in "${!REVERIFIED_RECENTLY[@]}"; do
      [[ $i -gt 0 ]] && printf ',\n'
      printf '    %s' "${REVERIFIED_RECENTLY[$i]}"
    done
    printf '\n'
  fi
  printf '  ],\n'

  printf '  "needs_reverification": [\n'
  if [[ ${#NEEDS_REVERIFICATION[@]} -gt 0 ]]; then
    for i in "${!NEEDS_REVERIFICATION[@]}"; do
      [[ $i -gt 0 ]] && printf ',\n'
      printf '    %s' "${NEEDS_REVERIFICATION[$i]}"
    done
    printf '\n'
  fi
  printf '  ],\n'

  printf '  "summary": "%d of %d items need re-verification"\n' \
    "$((WARNINGS + FAILURES + CRITICALS))" "${#ALL_TARGETS[@]}"
  printf '}\n'
fi

# ── Phase 5: Summary & exit codes ─────────────────────────────────
info ""
info "${CYAN}=== SUMMARY ===${NC}"
info "  Targets scanned: ${#ALL_TARGETS[@]}"
info "  Passed:          ${GREEN}${PASSES}${NC}"
info "  Warnings:        ${YELLOW}${WARNINGS}${NC}"
info "  Failures:        ${RED}${FAILURES}${NC}"
info "  Critical:        ${MAGENTA}${CRITICALS}${NC}"

if (( CRITICALS > 0 || FAILURES > 0 )); then
  info "${RED}Harness sensor FAIL: deferred tasks >60d. Hard-constraint cascade triggered.${NC}"
  exit 2
elif (( WARNINGS > 0 )); then
  info "${YELLOW}Harness sensor WARN: deferred tasks >30d. Spawn re-verification agents.${NC}"
  exit 1
else
  info "${GREEN}Harness sensor PASS: all deferred tasks recently verified.${NC}"
  exit 0
fi
