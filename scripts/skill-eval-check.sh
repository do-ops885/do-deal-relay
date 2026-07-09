#!/usr/bin/env bash
# skill-eval-check.sh - Validate skills against SKILLS.md standards
#
# Companion sensor for the SKILLS.md guide (Harness role: feedforward guide).
# Computationally enforces:
#   1. YAML frontmatter (name + description) at line 1
#   2. ## Rationalizations section present
#   3. ## Red Flags section present
#   4. SKILL.md <= 250 lines (hard-constraints.md MAX_LINES_PER_SKILL_MD)
#
# For oversized skills, prints an actionable split plan using the
# "Core Whitelist Extraction" algorithm:
#   - Sections like "Core Workflow", "Setup", "Rationalizations", "Red Flags" stay
#   - Everything else (commands, references, examples, troubleshooting) moves to
#     reference/<n>-<slug>.md per SKILLS.md directory structure.
#
# Usage:
#   ./scripts/skill-eval-check.sh         # full report + split plans
#   ./scripts/skill-eval-check.sh --quiet # only offenders, one line each
#   ./scripts/skill-eval-check.sh --json  # structured output for tooling
#   ./scripts/skill-eval-check.sh --check # skip split-plan generation
#   ./scripts/skill-eval-check.sh --help

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SKILLS_ROOT="${ROOT_DIR}/.agents/skills"
MAX_LINES=250

# Modes
QUIET=false
JSON=false
CHECK_ONLY=false

# Color codes (preserved in harness-audit.sh style)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters (use `: $((VAR++))` to avoid set -e traps from pre-increment-zero)
PASSES=0
WARNINGS=0
FAILURES=0
OFFENDERS=()

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet)  QUIET=true;     shift ;;
    --json)   JSON=true;      shift ;;
    --check)  CHECK_ONLY=true; shift ;;
    --help|-h)
      sed -n '2,/^set -uo/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

# JSON mode: redirect human stdout to stderr, save FD 3 for final JSON
if $JSON; then
  exec 3>&1
  exec 1>&2
fi

# ── Logging helpers ───────────────────────────────────────────────────
info() {
  $QUIET && return 0
  $JSON && return 0
  echo -e "$@"
}
ok()   { : $((PASSES++));  $QUIET || $JSON || echo -e "${GREEN}✓${NC} $1"; }
warn() { : $((WARNINGS++)); $QUIET || $JSON || echo -e "${YELLOW}!${NC} $1"; }
fail() { : $((FAILURES++)); OFFENDERS+=("$1"); $QUIET || $JSON || echo -e "${RED}✗${NC} $1"; }

# ── Phase 1: Discover skills ─────────────────────────────────────────
mapfile -t SKILL_FILES < <(find "${SKILLS_ROOT}" -name 'SKILL.md' -type f 2>/dev/null | sort)
[[ ${#SKILL_FILES[@]} -eq 0 ]] && { echo "no SKILL.md files under ${SKILLS_ROOT}" >&2; exit 2; }

info "${CYAN}=== SKILL EVALUATION (${#SKILL_FILES[@]} skills) ===${NC}"

# ── Phase 2 + 3: Structure & length checks ──────────────────────────
# Collect issues per file as `failed_path|warn_count|fail_count`
declare -A FILE_ISSUE_COUNT
declare -A FILE_LINE_COUNT

for sf in "${SKILL_FILES[@]}"; do
  rel="${sf#${ROOT_DIR}/}"

  # Count lines (portable)
  line_count=$(wc -l < "$sf" | tr -d ' ')
  FILE_LINE_COUNT["$sf"]="$line_count"

  # ── Structure checks ──
  frontmatter_ok=false
  rationalizations_ok=false
  red_flags_ok=false

  if [[ "$(head -1 "$sf")" == "---" ]]; then
    # Frontmatter present; check for name + description
    if awk 'NR==1 && /^---$/ {f=1; next} f && /^---$/ {exit 0} f && /^name:/ {n=1} f && /^description:/ {d=1} END{exit !(n && d)}' "$sf"; then
      frontmatter_ok=true
    fi
  fi
  if grep -qE '^## Rationalizations' "$sf"; then rationalizations_ok=true; fi
  if grep -qE '^## Red Flags' "$sf"; then red_flags_ok=true; fi

  # Report structure findings
  if $frontmatter_ok; then
    ok "${rel} — YAML frontmatter"
  else
    warn "${rel} — missing YAML frontmatter (name + description)"
  fi
  if $rationalizations_ok; then
    ok "${rel} — ## Rationalizations"
  else
    warn "${rel} — missing ## Rationalizations"
  fi
  if $red_flags_ok; then
    ok "${rel} — ## Red Flags"
  else
    warn "${rel} — missing ## Red Flags"
  fi

  # ── Length check ──
  if (( line_count > MAX_LINES )); then
    over=$((line_count - MAX_LINES))
    fail "${rel} — ${line_count} lines (limit ${MAX_LINES}, over by ${over})"
  else
    ok "${rel} — ${line_count} lines (within ${MAX_LINES})"
  fi
done

# ── Phase 4: Split plans for oversized skills ────────────────────────
emit_split_plan() {
  local sf="$1"; local lc="$2"; local rel="${sf#${ROOT_DIR}/}"; local dir; dir="$(dirname "$sf")"

  info ""
  info "${CYAN}SPLIT PLAN for: ${rel} (${lc} lines)${NC}"
  info ""

  # Tiny-overflow actionable tip
  if (( lc <= 280 )); then
    info "  ${YELLOW}Actionable Tip${NC}: File is only $((lc - MAX_LINES)) over the limit."
    info "  Consider trimming boilerplate, redundant examples, or trailing whitespace"
    info "  before doing a structural split."
    return 0
  fi

  # Already has reference/ subdir? Use highest prefix +1 for new files.
  local next_prefix=1
  if [[ -d "$dir/reference" ]]; then
    local maxp; maxp=$(find "$dir/reference" -maxdepth 1 -type f -name '[0-9][0-9]-*.md' 2>/dev/null \
      | sed -E 's|.*/([0-9][0-9])-.*|\1|' | sort -n | tail -1)
    [[ -n "$maxp" ]] && next_prefix=$((10#$maxp + 1))
  fi

  # Use awk to enumerate H2 sections with title + line ranges, tab-separated
  local map
  map=$(awk '
    /^## / {
      if (in_h2) { print prev_title "\t" start "\t" NR-1 }
      prev_title = substr($0, 4)
      sub(/^[[:space:]]+/, "", prev_title)
      sub(/[[:space:]]+$/, "", prev_title)
      start = NR
      in_h2 = 1
      next
    }
    END { if (in_h2) print prev_title "\t" start "\t" NR }
  ' "$sf")

  if [[ -z "$map" ]]; then
    info "  ${YELLOW}[!]${NC} UNPARSABLE STRUCTURE: No H2 sections found."
    info "  Manually split content into '## Core Workflow' and '## Reference'"
    info "  before running this again."
    return 0
  fi

  # Whitelist of section titles that should stay in primary SKILL.md
  local keep_re='^(Core Workflow|Workflow|When to Use|Rationalizations|Red Flags|Prerequisites|Prerequisite|Introduction|Setup|Quick Start|Overview)$'

  local keep_lines=0
  local extract_count=0
  local primary_keep_sections=()

  info "  ${GREEN}Primary${NC}: ${rel} (target ≤100 lines)"
  info "    - Keep: YAML frontmatter + Rationalizations + Red Flags"
  info "    - Keep H2 sections matching: Core Workflow, Setup, When to Use, etc."

  local idx=0
  while IFS=$'\t' read -r title start end; do
    [[ -z "$title" ]] && continue
    idx=$((idx + 1))
    local sz=$((end - start + 1))
    local slug; slug=$(echo "$title" \
      | tr '[:upper:]' '[:lower:]' \
      | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')

    if [[ "$title" =~ $keep_re ]]; then
      primary_keep_sections+=("$title")
      keep_lines=$((keep_lines + sz))
      info "    ${GREEN}k${NC}  '${title}' lines ${start}-${end} (${sz} lines)"
    else
      extract_count=$((extract_count + 1))
      local padded; padded=$(printf "%02d" "$next_prefix")
      info "    ${YELLOW}x${NC}  '${title}' → reference/${padded}-${slug}.md  (${sz} lines)"
      next_prefix=$((next_prefix + 1))
    fi

    # Warn if a would-be extracted section itself exceeds the limit
    if (( sz > MAX_LINES )) && [[ ! "$title" =~ $keep_re ]]; then
      info "        ${RED}[!]${NC} Target exceeds ${MAX_LINES} lines. Requires manual H3 sub-splitting."
    fi
  done <<< "$map"

  local primary_target=$((keep_lines > 100 ? keep_lines : 100))
  info ""
  info "  After split: primary ~${primary_target} lines, ${extract_count} reference file(s) extracted."
}

# Emit split plans only for offenders that exceeded the line limit
for sf in "${OFFENDERS[@]}"; do
  # Skip non-length offenders (warn-only structural issues)
  issue=$(grep -E "^${sf#${ROOT_DIR}/} — [0-9]+ lines" <<< "" 2>/dev/null || true)
  # Reliably match by line-count pattern using precomputed value
  lc="${FILE_LINE_COUNT[$sf]:-0}"
  if (( lc > MAX_LINES )); then
    $CHECK_ONLY || emit_split_plan "$sf" "$lc"
  fi
done

# ── Phase 5: JSON output ─────────────────────────────────────────────
if $JSON; then
  # Restore original stdout (FD 3) before emitting JSON
  exec 1>&3
  exec 3>&-

  # Build JSON manually using jq-safe assembly
  printf '{\n'
  printf '  "skills_root": "%s",\n' "${SKILLS_ROOT}"
  printf '  "max_lines": %d,\n' "${MAX_LINES}"
  printf '  "totals": { "passes": %d, "warnings": %d, "failures": %d },\n' "${PASSES}" "${WARNINGS}" "${FAILURES}"
  printf '  "offenders": [\n'
  first=true
  for sf in "${OFFENDERS[@]}"; do
    lc="${FILE_LINE_COUNT[$sf]:-0}"
    $first || printf ',\n'
    first=false
    printf '    { "path": "%s", "lines": %d, "over_count": %d }' \
      "${sf#${ROOT_DIR}/}" "$lc" "$((lc - MAX_LINES))"
  done
  printf '\n  ]\n}\n'
fi

# ── Phase 6: Summary ─────────────────────────────────────────────────
info ""
info "${CYAN}=== SUMMARY ===${NC}"
info "  Passed:   ${GREEN}${PASSES}${NC}"
info "  Warnings: ${YELLOW}${WARNINGS}${NC}"
info "  Failures: ${RED}${FAILURES}${NC}"

# ── Exit codes ────────────────────────────────────────────────────────
# 0 = healthy
# 1 = warnings only (structural deficits in some skills)
# 2 = failures (one or more skills exceed 250 lines)
if (( FAILURES > 0 )); then
  $JSON || info "${RED}Harness sensor FAIL: ${FAILURES} skill(s) exceed ${MAX_LINES}-line limit. See split plans above.${NC}"
  exit 2
elif (( WARNINGS > 0 )); then
  $JSON || info "${YELLOW}Harness sensor WARN: ${WARNINGS} structural deficit(s); no length violations.${NC}"
  exit 1
else
  $JSON || info "${GREEN}Harness sensor PASS: all ${#SKILL_FILES[@]} skills conform.${NC}"
  exit 0
fi
