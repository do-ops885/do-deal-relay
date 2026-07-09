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
    pass "$label exists"; ((PASSES++)); return 0
  else
    fail "$label MISSING"; ((FAILS++)); MISSING_FILES+=("$path"); return 1
  fi
}

check_dir() {
  local path="$1"; local label="${2:-$1}"
  if [ -d "$PROJECT_ROOT/$path" ]; then
    pass "$label exists"; ((PASSES++)); return 0
  else
    fail "$label MISSING"; ((FAILS++)); MISSING_FILES+=("$path"); return 1
  fi
}

check_script() {
  local path="$1"; local label="${2:-$1}"
  if [ -x "$PROJECT_ROOT/$path" ]; then
    pass "$label executable"; ((PASSES++)); return 0
  elif [ -f "$PROJECT_ROOT/$path" ]; then
    warn "$label exists but NOT executable"; ((WARNS++))
    MISSING_SCRIPTS+=("$path (not executable)"); return 0
  else
    gap "$label MISSING — should exist per documentation"; ((FAILS++))
    MISSING_SCRIPTS+=("$path"); return 1
  fi
}

add_gap() {
  GAPS+=("$1")
  GAP_DETAILS+=("$1|$2|$3")
}

# ═════════════════════════════════════════════════════════════════
# PHASE 1: CATALOG GUIDES
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ HARNESS AUDIT — do-deal-relay ═══${NC}"
echo ""

echo -e "${BOLD}[Phase 1] Guide Files (Feedforward Controls)${NC}"

GUIDE_FILES=(
  "AGENTS.md:Coordination rules, anti-patterns, delegation"
  "agents-docs/hard-constraints.md:Line limits, trust thresholds, hot files"
  "agents-docs/quality-standards.md:500-line rule, atomic commits, URL rules"
  "agents-docs/SKILLS.md:Skills as procedural guides"
  "agents-docs/SUB-AGENTS.md:Sub-agents as context isolation guides"
  "agents-docs/CONTEXT.md:Token budgets, back-pressure, chunking"
  "agents-docs/PROJECT_STRUCTURE.md:Root policy, directory ownership"
  "agents-docs/NEVER-BYPASS-SYSTEM.md:Audit requirements, bypass policies"
  "agents-docs/HARNESS.md:Framework & philosophy (meta-guide)"
)

for entry in "${GUIDE_FILES[@]}"; do
  file="${entry%%:*}"
  desc="${entry#*:}"
  check_file "$file" "$file ($desc)"
done

echo ""
echo -e "${BOLD}[Phase 2] Sensor Files (Feedback Controls)${NC}"

SENSOR_FILES=(
  "agents-docs/HOOKS.md:Stop hooks, verify-on-change"
  "agents-docs/GUARD_RAILS.md:Pre-commit/pre-push gates"
  "agents-docs/SYSTEM_REFERENCE.md:9-gate validation pipeline, DORA metrics"
  "agents-docs/accuracy-guardrails.md:Config contracts, endpoint format checks"
  "agents-docs/LEARNINGS.md:Failure log (steering loop input)"
  "agents-docs/LESSONS.md:Detailed post-mortems"
  "agents-docs/self-learning-patterns.md:Escalation mechanism"
)

for entry in "${SENSOR_FILES[@]}"; do
  file="${entry%%:*}"
  desc="${entry#*:}"
  check_file "$file" "$file ($desc)"
done

# ═════════════════════════════════════════════════════════════════
# PHASE 3: EXECUTABLE SENSORS
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}[Phase 3] Executable Sensors (Scripts & Hooks)${NC}"

SCRIPT_SENSORS=(
  "scripts/pev-gates.sh:PEV verification gates"
  "scripts/quality_gate.sh:13 quality gates"
  "scripts/agent-toolkit.sh:Unified toolkit (doctor/quality/setup/docs)"
  "scripts/pre-commit-hook.sh:10 pre-commit guard rails"
  "scripts/pre-push-hook.sh:9 pre-push guard rails"
  "scripts/validate-codes.sh:9 validation gates"
  "scripts/validate-skills.sh:Skill symlink integrity"
  "scripts/setup-skills.sh:Skill symlink setup"
  "scripts/guard-rail-audit.sh:Never-bypass audit system"
  "scripts/worker-host.sh:Worker host resolution"
)

for entry in "${SCRIPT_SENSORS[@]}"; do
  file="${entry%%:*}"
  desc="${entry#*:}"
  check_script "$file" "$file ($desc)"
done

# Check git hooks
echo ""
echo -e "${BOLD}[Phase 4] Git Hooks (Installed Sensors)${NC}"

HOOKS=(
  ".git/hooks/pre-commit:Pre-commit guard rails"
  ".git/hooks/pre-push:Pre-push guard rails"
)

for entry in "${HOOKS[@]}"; do
  file="${entry%%:*}"
  desc="${entry#*:}"
  check_script "$file" "$file ($desc)"
done

# ═════════════════════════════════════════════════════════════════
# PHASE 5: GUIDE→SENSOR PAIRING
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}[Phase 5] Guide → Sensor Pairing${NC}"

# Each pair: "guide|sensor|description|regulation_category"

PAIRS=(
  "AGENTS.md:TypeScript anti-patterns|npx tsc --noEmit|Non-null assertion, unused imports, regex patterns|maintainability"
  "hard-constraints.md:500-line limit|quality_gate.sh:line-count gate|Files exceeding 500 lines blocked|maintainability"
  "hard-constraints.md:root directory policy|quality_gate.sh:root-dir gate|Files in wrong directories caught|maintainability"
  "quality-standards.md:atomic commits|pre-commit-hook.sh|Atomicity enforced via commit standards|maintainability"
  "SKILLS.md:skills as guides|validate-skills.sh|Skill integrity verified by symlink check|maintainability"
  "CONTEXT.md:token budgets|hooks:stop-hook|Back-pressure via context-efficient output|maintainability"
  "NEVER-BYPASS-SYSTEM.md:audit|guard-rail-audit.sh|Bypasses logged and audited|maintainability"
  "SYSTEM_REFERENCE.md:validation gates|validate-codes.sh|9-gate pipeline enforced|architecture_fitness"
  "accuracy-guardrails.md:config contracts|ci.yml:E2E-Smoke jobs|Config changes verified against CI workflows|architecture_fitness"
  "accuracy-guardrails.md:endpoint formats|tests/unit/ + tests/e2e/|Response format changes caught by tests|behaviour"
)

for pair in "${PAIRS[@]}"; do
  IFS='|' read -r guide sensor desc category <<< "$pair"
  guide_file="${guide%%:*}"
  sensor_file="${sensor%%:*}"

  guide_ok=true; sensor_ok=true

  # Check guide exists (file or section)
  if [ -f "$PROJECT_ROOT/$guide_file" ]; then
    $VERBOSE && info "$guide → $sensor : $desc [$category]"
  else
    guide_ok=false
  fi

  # Check sensor exists
  case "$sensor_file" in
    npx\ *) sensor_ok=true ;;  # CLI tools assumed available
    hooks:*) sensor_ok=true ;; # Hook frameworks assumed
    tests/*)
      if [ ! -d "$PROJECT_ROOT/$sensor_file" ]; then
        sensor_ok=false
      fi
      ;;
    ci.yml:*)
      if [ ! -f "$PROJECT_ROOT/.github/workflows/ci.yml" ]; then
        sensor_ok=false
      fi
      ;;
    *)
      if [ ! -f "$PROJECT_ROOT/$sensor_file" ] && [ ! -x "$PROJECT_ROOT/$sensor_file" ]; then
        sensor_ok=false
      fi
      ;;
  esac

  if $guide_ok && $sensor_ok; then
    pass "$desc"
    ((PASSES++))
  elif $guide_ok && ! $sensor_ok; then
    gap "$desc — GUIDE exists but SENSOR ($sensor_file) MISSING"
    ((FAILS++))
    add_gap "$desc" "$guide_file" "$sensor_file"
  elif ! $guide_ok && $sensor_ok; then
    warn "$desc — SENSOR exists but GUIDE ($guide_file) MISSING"
    ((WARNS++))
  else
    fail "$desc — BOTH guide and sensor MISSING"
    ((FAILS++))
  fi

done

# ═════════════════════════════════════════════════════════════════
# PHASE 6: LEARNINGS ANALYSIS (Steering Loop Health)
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}[Phase 6] LEARNINGS.md Analysis (Steering Loop)${NC}"

LEARNINGS_FILE="$PROJECT_ROOT/agents-docs/LEARNINGS.md"
if [ ! -f "$LEARNINGS_FILE" ]; then
  fail "LEARNINGS.md not found"
else
  TOTAL_LEARNINGS=$(grep -c '^| 2026-' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  info "Total recorded lessons: $TOTAL_LEARNINGS"

  # Check for recurring issues (same root cause appearing >1 time)
  # Patterns to detect:
  # - "CI workflow" / "deploy" failures → no automated env-var check
  # - "merge conflicts" → no branch-coordination sensor
  # - "deferred items" → no re-verification sensor
  # - "skill evals missing" → no eval-coverage sensor

  echo ""
  echo "  Recurring issue analysis:"

  # Pattern: config/env-var changes breaking CI
  CONFIG_COUNT=$(grep -c 'validateConfig\|env.*var\|secret.*not set\|missing.*EMAIL_WEBHOOK\|missing.*CLOUDFLARE_WORKER_HOST' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$CONFIG_COUNT" -ge 2 ]; then
    gap "Config/env-var changes breaking CI ($CONFIG_COUNT occurrences) — no computational sensor to validate CI workflow parity"
    add_gap "Config/env-var CI drift" "accuracy-guardrails.md" "ci-workflow-validator.sh (NOT YET CREATED)"
  else
    pass "Config/env-var CI drift ($CONFIG_COUNT occurrences — below threshold)"
  fi

  # Pattern: merge conflicts on hot files
  MERGE_COUNT=$(grep -c 'merge conflict\|both modified same' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$MERGE_COUNT" -ge 2 ]; then
    gap "Merge conflicts on hot files ($MERGE_COUNT occurrences) — no computational sensor for branch overlap detection"
    add_gap "Hot file merge conflicts" "AGENTS.md:hot files list" "branch-overlap-check.sh (NOT YET CREATED)"
  else
    pass "Merge conflicts on hot files ($MERGE_COUNT occurrences — below threshold)"
  fi

  # Pattern: stale deferrals / GOAP drift
  DEFERRAL_COUNT=$(grep -c 'deferred\|stale.*status\|without re-verifying' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$DEFERRAL_COUNT" -ge 2 ]; then
    gap "Stale GOAP deferrals ($DEFERRAL_COUNT occurrences) — no automated re-verification sensor"
    add_gap "GOAP stale deferrals" "AGENTS.md:Re-Verification Protocol" "goap-reverify.sh (NOT YET CREATED)"
  else
    pass "Stale GOAP deferrals ($DEFERRAL_COUNT occurrences — below threshold)"
  fi

  # Pattern: skill evals missing
  EVAL_COUNT=$(grep -c 'missing evals\|evals.*missing\|eval.*coverage' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$EVAL_COUNT" -ge 1 ]; then
    gap "Skills missing evals ($EVAL_COUNT occurrences) — no automated eval-coverage sensor"
    add_gap "Skill eval coverage" "SKILLS.md" "skill-eval-check.sh (NOT YET CREATED)"
  else
    pass "Skill eval coverage ($EVAL_COUNT occurrences — below threshold)"
  fi

  # Pattern: docs-implementation drift
  DRIFT_COUNT=$(grep -c 'documented.*not exist\|not.*documented\|documentation drift\|phantom' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$DRIFT_COUNT" -ge 2 ]; then
    gap "Docs-implementation drift ($DRIFT_COUNT occurrences) — no automated endpoint-docs parity check"
    add_gap "Docs-implementation drift" "accuracy-guardrails.md" "docs-parity-check.sh (NOT YET CREATED)"
  else
    pass "Docs-implementation drift ($DRIFT_COUNT occurrences — below threshold)"
  fi

  # Pattern: test suite too heavy for incremental
  SUITE_COUNT=$(grep -c 'full test suite.*too heavy\|timed out.*300s\|incremental validation' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$SUITE_COUNT" -ge 1 ]; then
    warn "Full test suite too heavy ($SUITE_COUNT occurrences) — incremental validation not yet automated"
  else
    pass "Test suite weight ($SUITE_COUNT occurrences — below threshold)"
  fi

  # Pattern: research-before-implement
  RESEARCH_COUNT=$(grep -c 'implement then discover.*wrong\|research.*before implement' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$RESEARCH_COUNT" -ge 1 ]; then
    warn "Research→Implement pattern ($RESEARCH_COUNT occurrences) — guide exists in AGENTS.md but no enforcement sensor"
  else
    pass "Research→Implement pattern ($RESEARCH_COUNT occurrences — below threshold)"
  fi
fi

# ═════════════════════════════════════════════════════════════════
# PHASE 7: REGULATION CATEGORY COVERAGE
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}[Phase 7] Regulation Category Coverage${NC}"

# Maintainability (strongest)
MAINTAINABILITY_SCORE=100
MAINTAINABILITY_NOTES=()
# Deduct for missing scripts
for s in "scripts/pev-gates.sh" "scripts/quality_gate.sh" "scripts/pre-commit-hook.sh"; do
  if [ ! -f "$PROJECT_ROOT/$s" ]; then
    MAINTAINABILITY_SCORE=$((MAINTAINABILITY_SCORE - 10))
    MAINTAINABILITY_NOTES+=("$s missing")
  fi
done
echo "  Maintainability: ${GREEN}$MAINTAINABILITY_SCORE%${NC}"
for note in "${MAINTAINABILITY_NOTES[@]}"; do
  warn "  $note"
done

# Architecture Fitness (partial)
ARCH_SCORE=60
ARCH_NOTES=()
if [ ! -f "$PROJECT_ROOT/.github/workflows/ci.yml" ]; then ARCH_SCORE=$((ARCH_SCORE - 15)); ARCH_NOTES+=("ci.yml missing"); fi
if [ ! -f "$PROJECT_ROOT/scripts/validate-codes.sh" ]; then ARCH_SCORE=$((ARCH_SCORE - 10)); ARCH_NOTES+=("validate-codes.sh missing"); fi
if [ ! -d "$PROJECT_ROOT/tests/e2e" ]; then ARCH_SCORE=$((ARCH_SCORE - 10)); ARCH_NOTES+=("e2e tests missing"); fi
# Check DORA metrics endpoint
if ! grep -q 'dora-metrics\|DORA' "$PROJECT_ROOT/worker/index.ts" 2>/dev/null; then
  ARCH_SCORE=$((ARCH_SCORE - 5))
  ARCH_NOTES+=("DORA metrics endpoint not found in worker/index.ts")
fi
echo "  Architecture Fitness: ${YELLOW}$ARCH_SCORE%${NC}"
for note in "${ARCH_NOTES[@]}"; do
  warn "  $note"
done

# Behaviour (weakest)
BEHAVIOUR_SCORE=40
BEHAVIOUR_NOTES=()
if [ ! -d "$PROJECT_ROOT/tests/unit" ]; then BEHAVIOUR_SCORE=$((BEHAVIOUR_SCORE - 15)); BEHAVIOUR_NOTES+=("unit tests missing"); fi
if [ ! -d "$PROJECT_ROOT/tests/e2e" ]; then BEHAVIOUR_SCORE=$((BEHAVIOUR_SCORE - 15)); BEHAVIOUR_NOTES+=("e2e tests missing"); fi
# Check for approved-fixtures pattern
if ! find "$PROJECT_ROOT/tests" -name "*.fixture.*" -o -name "*fixture*" 2>/dev/null | grep -q .; then
  BEHAVIOUR_SCORE=$((BEHAVIOUR_SCORE - 10))
  BEHAVIOUR_NOTES+=("no approved fixtures pattern found")
fi
echo "  Behaviour: ${YELLOW}$BEHAVIOUR_SCORE%${NC}"
for note in "${BEHAVIOUR_NOTES[@]}"; do
  warn "  $note"
done

# ═════════════════════════════════════════════════════════════════
# PHASE 8: COHERENCE CHECK
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}[Phase 8] Coherence: Guide↔Sensor Consistency${NC}"

# Check: "never use x!" guide in AGENTS.md — is there a lint rule catching it?
if grep -q "x!.*non-null assertion.*forbidden" "$PROJECT_ROOT/AGENTS.md" 2>/dev/null; then
  if grep -q "no-non-null-assertion\|non-null-assertion" "$PROJECT_ROOT/.eslintrc*" "$PROJECT_ROOT/eslint.config*" "$PROJECT_ROOT/tsconfig.json" 2>/dev/null; then
    pass "Non-null assertion guide has matching lint sensor"
  else
    warn "Non-null assertion guide exists but no lint rule found — may only be caught by code review"
  fi
fi

# Check: "max 500 lines" guide — is there a guard rail gate for it?
if grep -q "MAX_LINES_PER_SOURCE_FILE=500" "$PROJECT_ROOT/agents-docs/hard-constraints.md" 2>/dev/null; then
  # This would be enforced by quality_gate.sh or a pre-commit hook
  if [ -f "$PROJECT_ROOT/scripts/quality_gate.sh" ] || [ -f "$PROJECT_ROOT/scripts/pre-commit-hook.sh" ]; then
    pass "500-line limit guide has matching sensor"
  else
    warn "500-line limit guide exists but quality_gate.sh and pre-commit-hook.sh are missing"
  fi
fi

# Check: "Fix-Forward" guide — is there a sensor enforcing it?
if grep -q "Fix-Forward" "$PROJECT_ROOT/agents-docs/accuracy-guardrails.md" 2>/dev/null; then
  warn "Fix-Forward rule is inferential — no computational sensor exists (by design)"
fi

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

# Compute overall health
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
echo -e "    Architecture Fitness: ${YELLOW}$ARCH_SCORE%${NC}"
echo -e "    Behaviour:            ${YELLOW}$BEHAVIOUR_SCORE%${NC}"

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

# ── Unescalated Issues ──────────────────────────────────────────
if [ ${#UNESCALATED_ISSUES[@]} -gt 0 ]; then
  echo ""
  echo -e "${BOLD}  ═══ UNESCALATED RECURRING ISSUES (${#UNESCALATED_ISSUES[@]}) ═══${NC}"
  for issue in "${UNESCALATED_ISSUES[@]}"; do
    echo -e "  ${RED}⟐${NC} $issue — should be escalated to computational control"
  done
fi

echo ""

# ═════════════════════════════════════════════════════════════════
# JSON OUTPUT (if requested)
# ═════════════════════════════════════════════════════════════════

if $JSON; then
  echo "{"
  echo "  \"health_score\": $HEALTH,"
  echo "  \"passes\": $PASSES,"
  echo "  \"warnings\": $WARNS,"
  echo "  \"failures\": $FAILS,"
  echo "  \"regulation_coverage\": {"
  echo "    \"maintainability\": $MAINTAINABILITY_SCORE,"
  echo "    \"architecture_fitness\": $ARCH_SCORE,"
  echo "    \"behaviour\": $BEHAVIOUR_SCORE"
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
  echo -e "${RED}Audit found $FAILS failure(s).${NC}"
  exit 1
elif [ "$WARNS" -gt 0 ]; then
  echo -e "${YELLOW}Audit passed with $WARNS warning(s).${NC}"
  exit 0
else
  echo -e "${GREEN}All harness checks passed.${NC}"
  exit 0
fi
