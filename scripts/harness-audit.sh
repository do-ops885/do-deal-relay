#!/usr/bin/env bash
# Harness Audit — do-deal-relay
# Audits harness coverage: checks guide↔sensor pairing, identifies gaps where
# recurring issues lack computational controls, and produces a health score.
#
# Usage: ./scripts/harness-audit.sh [--verbose] [--json]
#
# Exit codes: 0 = healthy, 1 = warnings, 2 = critical gaps

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERBOSE=false
JSON=false

for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=true ;;
    --json) JSON=true ;;
    *) echo "Unknown flag: $arg"; exit 2 ;;
  esac
done

# When JSON mode is active, redirect human output to stderr
if $JSON; then
  exec 3>&1
  exec 1>&2
fi

# ── Colour helpers ──────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

pass()  { echo -e "  ${GREEN}✓${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
info()  { echo -e "  ${BLUE}ℹ${NC} $1"; }
gap()   { echo -e "  ${RED}⟐${NC} $1"; }

# ── State ───────────────────────────────────────────────────────
PASSES=0; FAILS=0; WARNS=0
GAPS=(); GAP_DETAILS=()
MISSING_FILES=(); MISSING_SCRIPTS=()
UNESCALATED_ISSUES=()

# ── Helpers ─────────────────────────────────────────────────────
check_file() {
  local path="$1"; local label="${2:-$1}"
  if [ -f "$PROJECT_ROOT/$path" ]; then
    pass "$label exists"; : $((PASSES++)); return 0
  else
    fail "$label MISSING"; : $((FAILS++)); MISSING_FILES+=("$path"); return 0
  fi
}

check_dir() {
  local path="$1"; local label="${2:-$1}"
  if [ -d "$PROJECT_ROOT/$path" ]; then
    pass "$label exists"; : $((PASSES++)); return 0
  else
    fail "$label MISSING"; : $((FAILS++)); MISSING_FILES+=("$path"); return 0
  fi
}

check_script() {
  local path="$1"; local label="${2:-$1}"
  if [ -x "$PROJECT_ROOT/$path" ]; then
    pass "$label executable"; : $((PASSES++)); return 0
  elif [ -f "$PROJECT_ROOT/$path" ]; then
    warn "$label exists but NOT executable"; : $((WARNS++))
    MISSING_SCRIPTS+=("$path (not executable)"); return 0
  else
    gap "$label MISSING — should exist per documentation"; : $((FAILS++))
    MISSING_SCRIPTS+=("$path"); return 0
  fi
}

add_gap() {
  GAPS+=("$1")
  GAP_DETAILS+=("$1|$2|$3")
}

# Source check implementations
source "$SCRIPT_DIR/harness-audit-checks.sh"

# ═════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ HARNESS AUDIT — do-deal-relay ═══${NC}"

phase_guides
phase_sensors
phase_executable_sensors
phase_git_hooks
phase_pairing
phase_learnings
phase_regulation
phase_coherence

# ═════════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo -e "${BOLD}  HARNESS AUDIT SUMMARY${NC}"
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo ""
echo -e "  Passes:  ${GREEN}$PASSES${NC}"
echo -e "  Warnings: ${YELLOW}$WARNS${NC}"
echo -e "  Failures: ${RED}$FAILS${NC}"

TOTAL_CHECKS=$((PASSES + WARNS + FAILS))
if [ "$TOTAL_CHECKS" -gt 0 ]; then
  HEALTH=$(( (PASSES * 100) / TOTAL_CHECKS ))
else
  HEALTH=0
fi

echo ""
if [ "$HEALTH" -ge 90 ]; then
  echo -e "  Health Score: ${GREEN}$HEALTH%${NC} — Excellent"
elif [ "$HEALTH" -ge 70 ]; then
  echo -e "  Health Score: ${YELLOW}$HEALTH%${NC} — Good, some gaps"
elif [ "$HEALTH" -ge 50 ]; then
  echo -e "  Health Score: ${YELLOW}$HEALTH%${NC} — Needs attention"
else
  echo -e "  Health Score: ${RED}$HEALTH%${NC} — Critical gaps"
fi

echo ""
echo -e "  Regulation Coverage:"
echo -e "    Maintainability:      ${GREEN}$MAINTAINABILITY_SCORE%${NC}"
echo -e "    Architecture Fitness: ${YELLOW}${ARCH_SCORE:-0}%${NC}"
echo -e "    Behaviour:            ${YELLOW}${BEHAVIOUR_SCORE:-40}%${NC}"

# ── Gap Report ──────────────────────────────────────────────────
if [ ${#GAPS[@]} -gt 0 ]; then
  echo ""
  echo -e "${BOLD}  ═══ GAPS FOUND (${#GAPS[@]}) ═══${NC}"
  for i in "${!GAPS[@]}"; do
    IFS='|' read -r desc guide sensor <<< "${GAP_DETAILS[$i]}"
    echo ""
    echo -e "  ${RED}▸${NC} $desc"
    echo -e "    Guide:  $guide"
    echo -e "    Sensor: $sensor"
    echo -e "    Action: Create $sensor or add computational control"
  done
fi

# ── Missing Files ───────────────────────────────────────────────
if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  echo ""
  echo -e "${BOLD}  ═══ MISSING FILES (${#MISSING_FILES[@]}) ═══${NC}"
  for f in "${MISSING_FILES[@]}"; do
    echo -e "  ${RED}✗${NC} $f"
  done
fi

# ── Missing Scripts ─────────────────────────────────────────────
if [ ${#MISSING_SCRIPTS[@]} -gt 0 ]; then
  echo ""
  echo -e "${BOLD}  ═══ MISSING/INOPERABLE SCRIPTS (${#MISSING_SCRIPTS[@]}) ═══${NC}"
  for s in "${MISSING_SCRIPTS[@]}"; do
    echo -e "  ${YELLOW}⚠${NC} $s"
  done
fi

echo ""

# ═════════════════════════════════════════════════════════════════
# JSON OUTPUT
# ═════════════════════════════════════════════════════════════════

if $JSON; then
  exec 1>&3
  echo "{"
  echo "  \"health_score\": $HEALTH,"
  echo "  \"passes\": $PASSES,"
  echo "  \"warnings\": $WARNS,"
  echo "  \"failures\": $FAILS,"
  echo "  \"regulation_coverage\": {"
  echo "    \"maintainability\": $MAINTAINABILITY_SCORE,"
  echo "    \"architecture_fitness\": {"
  echo "      \"score\": ${ARCH_SCORE:-0},"
  echo "      \"ceiling\": ${ARCH_CEILING:-100},"
  echo "      \"credits\": ${ARCH_CREDITS_JSON:-[]},"
  echo "      \"deductions\": ${ARCH_DEDUCTIONS_JSON:-[]}"
  echo "    },"
  echo "    \"behaviour\": ${BEHAVIOUR_SCORE:-40}"
  echo "  },"
  echo "  \"gaps\": ["
  for i in "${!GAPS[@]}"; do
    IFS='|' read -r desc guide sensor <<< "${GAP_DETAILS[$i]}"
    comma=","
    if [ "$i" -eq $((${#GAPS[@]} - 1)) ]; then comma=""; fi
    echo "    {\"description\": \"$desc\", \"guide\": \"$guide\", \"sensor\": \"$sensor\"}$comma"
  done
  echo "  ]"
  echo "}"
fi

# ── Exit Code ───────────────────────────────────────────────────
if [ "$FAILS" -gt 0 ]; then
  $JSON || warn "Audit found $FAILS failure(s)."
  exit 2
elif [ "$WARNS" -gt 0 ]; then
  $JSON || warn "Audit passed with $WARNS warning(s)."
  exit 1
else
  $JSON || echo -e "${GREEN}All harness checks passed.${NC}"
  exit 0
fi
