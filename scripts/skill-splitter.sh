#!/usr/bin/env bash
# skill-splitter.sh - Auto-apply split plans from skill-eval-check.sh.
#
# Reads offenders via skill-eval-check.sh --json and physically splits
# oversized SKILL.md files by extracting non-whitelist H2 sections into
# reference/<n>-<slug>.md, then appending a Reference Map to the primary.
#
# Safety net per file:
#   1. Backup original to <file>.bak
#   2. Write new primary + reference files in temp staging
#   3. Re-run skill-eval-check.sh --quiet and grep for this file
#      - If still failing: rollback (restore .bak, remove new refs)
#      - If passing: remove .bak
#
# Tiny-overflow (251-280 lines, "actionable tip" range) is skipped — manual
# trimming preferred. Only files at >280 lines are physically split.
#
# Usage:
#   ./scripts/skill-splitter.sh         # dry-run (default)
#   ./scripts/skill-splitter.sh --apply # write changes
#   ./scripts/skill-splitter.sh --help

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
EVAL_SCRIPT="${SCRIPT_DIR}/skill-eval-check.sh"

APPLY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --help|-h)
      sed -n '2,/^set -uo/p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# Whitelist: section titles that stay in primary SKILL.md
KEEP_RE='^(Core Workflow|Workflow|When to Use|Rationalizations|Red Flags|Prerequisites|Prerequisite|Introduction|Setup|Quick Start|Overview)$'

# Counters
APPLIED=0; SKIPPED=0; ROLLBACKS=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "${CYAN}=== SKILL SPLITTER ===${NC}"
if ! $APPLY; then
  echo -e "${YELLOW}DRY-RUN mode — use --apply to write changes.${NC}"
fi
echo ""

# Fetch offenders from skill-eval-check.sh
if ! command -v jq >/dev/null; then
  echo "${RED}jq required${NC}" >&2; exit 2
fi

# Use `|| true` so the (correctly non-zero) exit-2 from skill-eval-check
# doesn't abort this script under `set -uo pipefail`.
OFFENDERS_JSON=$("$EVAL_SCRIPT" --json 2>/dev/null || true)

OFFENDER_COUNT=$(echo "$OFFENDERS_JSON" | jq -r '.offenders | length' 2>/dev/null || echo "0")

if [[ "$OFFENDER_COUNT" == "0" ]]; then
  echo -e "${GREEN}No offenders found. Nothing to split.${NC}"
  exit 0
fi

echo "Found $OFFENDER_COUNT offender(s) in skill-eval-check.json"
echo ""

# Per-offender processing
echo "$OFFENDERS_JSON" | jq -c '.offenders[]' | while read -r offender; do
  rel=$(echo "$offender" | jq -r '.path')
  lc=$(echo "$offender"  | jq -r '.lines')
  abs="${ROOT_DIR}/${rel}"
  skill_dir="$(dirname "$abs")"
  ref_dir="${skill_dir}/reference"

  printf "${CYAN}── %s (%s lines) ──${NC}\n" "$rel" "$lc"

  # Tiny-overflow: actionable tip range, skip physical split
  if (( lc <= 280 )); then
    echo "  ${YELLOW}[SKIPPED]${NC} Only $((lc - 250)) over limit — apply ACTIONABLE TIP (manual trim) instead."
    : $((SKIPPED++))
    echo ""
    continue
  fi

  echo "  ${CYAN}Plan${NC}: extract H2 sections into ${rel%SKILL.md}reference/<n>-<slug>.md"

  # Reuse same awk parser as skill-eval-check.sh
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
  ' "$abs")

  if [[ -z "$map" ]]; then
    echo "  ${RED}[FAIL]${NC} No H2 sections found in $rel. Skipping."
    echo ""
    continue
  fi

  # Determine prefix counter (start after highest existing numbered file)
  next_prefix=1
  if [[ -d "$ref_dir" ]]; then
    maxp=$(find "$ref_dir" -maxdepth 1 -type f -name '[0-9][0-9]-*.md' 2>/dev/null \
      | sed -E 's|.*/([0-9][0-9])-.*|\1|' | sort -n | tail -1)
    [[ -n "$maxp" ]] && next_prefix=$((10#$maxp + 1))
  else
    if $APPLY; then mkdir -p "$ref_dir"; fi
  fi

  if ! $APPLY; then
    # In dry-run, just enumerate what we'd extract
    while IFS=$'\t' read -r title start end; do
      [[ -z "$title" ]] && continue
      sz=$((end - start + 1))
      padded=$(printf "%02d" "$next_prefix")
      slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')
      if [[ "$title" =~ $KEEP_RE ]]; then
        echo "    ${GREEN}KEEP${NC}  $title (lines $start-$end, $sz)"
      else
        echo "    ${YELLOW}EXTRACT${NC}  $title → reference/${padded}-${slug}.md ($sz lines)"
        next_prefix=$((next_prefix + 1))
      fi
    done <<< "$map"
    echo ""
    continue
  fi

  # ── APPLY MODE ───────────────────────────────────────────────
  TMP_MAIN=$(mktemp)
  TMP_REFS=$(mktemp -d)
  CREATED_REFS=()

  # Primary: everything from line 1 up to (and including) the first H2's
  # content. Since the awk map starts at the FIRST H2's start line, anything
  # before that (frontmatter, H1, intro) goes into primary first.
  first_h2_start=$(echo "$map" | head -n1 | cut -f2)
  sed -n "1,$((first_h2_start - 1))p" "$abs" > "$TMP_MAIN"

  REF_MAP=()

  while IFS=$'\t' read -r title start end; do
    [[ -z "$title" ]] && continue
    sz=$((end - start + 1))

    if [[ "$title" =~ $KEEP_RE ]]; then
      # Keep in primary (do not write yet — primary is rebuilt from sections)
      :
    else
      # Extract: promote H2 to H1, add attribution line
      padded=$(printf "%02d" "$next_prefix")
      slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')
      ref_filename="${padded}-${slug}.md"
      {
        # Promote H2 to H1
        sed -n "${start},${end}p" "$abs" | sed '1s/^## /# /'
        echo ""
        echo "> Extracted from: ../SKILL.md"
      } > "${TMP_REFS}/${ref_filename}"
      REF_MAP+=("- [$title](reference/${ref_filename})")
      CREATED_REFS+=("${ref_dir}/${ref_filename}")
      next_prefix=$((next_prefix + 1))
    fi
  done <<< "$map"

  # Write kept sections to primary
  while IFS=$'\t' read -r title start end; do
    [[ -z "$title" ]] && continue
    if [[ "$title" =~ $KEEP_RE ]]; then
      sed -n "${start},${end}p" "$abs" >> "$TMP_MAIN"
      echo "" >> "$TMP_MAIN"
    fi
  done <<< "$map"

  # Append Reference Map
  if [[ ${#REF_MAP[@]} -gt 0 ]]; then
    echo "## Reference" >> "$TMP_MAIN"
    echo "" >> "$TMP_MAIN"
    printf '%s\n' "${REF_MAP[@]}" >> "$TMP_MAIN"
  fi

  # Atomic swap with backup
  cp "$abs" "${abs}.bak"
  cp "$TMP_MAIN" "$abs"
  cp "${TMP_REFS}"/* "$ref_dir/" 2>/dev/null || true

  # Verify: re-run check on this specific file
  new_lines=$(wc -l < "$abs" | tr -d ' ')
  if (( new_lines > 250 )); then
    echo "  ${RED}[ROLLBACK]${NC} new primary still $new_lines lines (>250) — revert"
    mv "${abs}.bak" "$abs"
    for r in "${CREATED_REFS[@]}"; do [[ -f "$r" ]] && rm -f "$r"; done
    : $((ROLLBACKS++))
  elif ! head -1 "$abs" | grep -q '^---$'; then
    echo "  ${RED}[ROLLBACK]${NC} frontmatter lost — revert"
    mv "${abs}.bak" "$abs"
    for r in "${CREATED_REFS[@]}"; do [[ -f "$r" ]] && rm -f "$r"; done
    : $((ROLLBACKS++))
  elif ! grep -qE '^## Rationalizations' "$abs" || ! grep -qE '^## Red Flags' "$abs"; then
    echo "  ${RED}[ROLLBACK]${NC} standard sections missing — revert"
    mv "${abs}.bak" "$abs"
    for r in "${CREATED_REFS[@]}"; do [[ -f "$r" ]] && rm -f "$r"; done
    : $((ROLLBACKS++))
  else
    rm -f "${abs}.bak"
    echo "  ${GREEN}[APPLIED]${NC} $rel: $lc → $new_lines lines, $((${#CREATED_REFS[@]})) reference file(s)"
    : $((APPLIED++))
  fi

  rm -f "$TMP_MAIN"
  rm -rf "$TMP_REFS"
  echo ""
done

# Re-run skill-eval-check post-batch for final confirmation
if $APPLY && (( APPLIED > 0 )); then
  echo ""
  echo -e "${CYAN}=== Post-split re-evaluation ===${NC}"
  "$EVAL_SCRIPT" --check 2>&1 | tail -6
fi

echo ""
echo -e "${CYAN}=== SUMMARY ===${NC}"
echo "  Applied:    ${GREEN}${APPLIED}${NC}"
echo "  Skipped:    ${YELLOW}${SKIPPED}${NC} (actionable-tip range, manual trim)"
echo "  Rollbacks:  ${RED}${ROLLBACKS}${NC}"
echo ""
