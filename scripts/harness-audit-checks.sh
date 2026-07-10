#!/usr/bin/env bash
# Harness Audit — Check Implementations
# Source file for harness-audit.sh — contains all check functions and phases.
# This file is NOT executed directly; it is sourced by harness-audit.sh.

# ── State (inherited from parent) ──────────────────────────────
# PASSES, FAILS, WARNS, GAPS, GAP_DETAILS, MISSING_FILES, MISSING_SCRIPTS
# UNESCALATED_ISSUES, PROJECT_ROOT, VERBOSE

# ═════════════════════════════════════════════════════════════════
# PHASE 1: CATALOG GUIDES
# ═════════════════════════════════════════════════════════════════

phase_guides() {
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
}

# ═════════════════════════════════════════════════════════════════
# PHASE 2: SENSOR FILES
# ═════════════════════════════════════════════════════════════════

phase_sensors() {
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
}

# ═════════════════════════════════════════════════════════════════
# PHASE 3: EXECUTABLE SENSORS
# ═════════════════════════════════════════════════════════════════

phase_executable_sensors() {
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
    "scripts/skill-eval-check.sh:Skill eval coverage (SKILLS.md computational sensor)"
    "scripts/ci-workflow-validator.sh:Config contract drift detection (accuracy-guardrails sensor)"
    "scripts/worker-host.sh:Worker host resolution"
  )

  for entry in "${SCRIPT_SENSORS[@]}"; do
    file="${entry%%:*}"
    desc="${entry#*:}"
    check_script "$file" "$file ($desc)"
  done
}

# ═════════════════════════════════════════════════════════════════
# PHASE 4: GIT HOOKS
# ═════════════════════════════════════════════════════════════════

phase_git_hooks() {
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
}

# ═════════════════════════════════════════════════════════════════
# PHASE 5: GUIDE→SENSOR PAIRING
# ═════════════════════════════════════════════════════════════════

phase_pairing() {
  echo ""
  echo -e "${BOLD}[Phase 5] Guide → Sensor Pairing${NC}"

  PAIRS=(
    "AGENTS.md:TypeScript anti-patterns|npx tsc --noEmit|Non-null assertion, unused imports, regex patterns|maintainability"
    "hard-constraints.md:500-line limit|quality_gate.sh:line-count gate|Files exceeding 500 lines blocked|maintainability"
    "hard-constraints.md:root directory policy|quality_gate.sh:root-dir gate|Files in wrong directories caught|maintainability"
    "quality-standards.md:atomic commits|pre-commit-hook.sh|Atomicity enforced via commit standards|maintainability"
    "SKILLS.md:skills as guides|validate-skills.sh|Skill integrity verified by symlink check|maintainability"
    "SKILLS.md:SKILL.md standards|scripts/skill-eval-check.sh|Computational validation of skill structure and ≤250-line size|maintainability"
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

    if [ -f "$PROJECT_ROOT/$guide_file" ]; then
      $VERBOSE && info "$guide → $sensor : $desc [$category]"
    else
      guide_ok=false
    fi

    case "$sensor_file" in
      npx\ *) sensor_ok=true ;;
      hooks:*) sensor_ok=true ;;
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
      : $((PASSES++))
    elif $guide_ok && ! $sensor_ok; then
      gap "$desc — GUIDE exists but SENSOR ($sensor_file) MISSING"
      : $((FAILS++))
      add_gap "$desc" "$guide_file" "$sensor_file"
    elif ! $guide_ok && $sensor_ok; then
      warn "$desc — SENSOR exists but GUIDE ($guide_file) MISSING"
      : $((WARNS++))
    else
      fail "$desc — BOTH guide and sensor MISSING"
      : $((FAILS++))
    fi
  done
}

# ═════════════════════════════════════════════════════════════════
# PHASE 6: LEARNINGS ANALYSIS
# ═════════════════════════════════════════════════════════════════

phase_learnings() {
  echo ""
  echo -e "${BOLD}[Phase 6] LEARNINGS.md Analysis (Steering Loop)${NC}"

  LEARNINGS_FILE="$PROJECT_ROOT/agents-docs/LEARNINGS.md"
  if [ ! -f "$LEARNINGS_FILE" ]; then
    fail "LEARNINGS.md not found"
    return
  fi

  TOTAL_LEARNINGS=$(grep -c '^| 2026-' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  info "Total recorded lessons: $TOTAL_LEARNINGS"

  echo ""
  echo "  Recurring issue analysis:"

  # Config/env-var CI drift
  CONFIG_COUNT=$(grep -c 'validateConfig\|env.*var\|secret.*not set\|missing.*EMAIL_WEBHOOK\|missing.*CLOUDFLARE_WORKER_HOST' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$CONFIG_COUNT" -ge 2 ]; then
    SENSOR_WIRED=false
    if [ -x "$PROJECT_ROOT/scripts/ci-workflow-validator.sh" ]; then
      if grep -lq 'ci-workflow-validator' \
           "$PROJECT_ROOT/scripts/pev-gates.sh" \
           "$PROJECT_ROOT/scripts/pre-push-hook.sh" \
           "$PROJECT_ROOT/scripts/pre-commit-hook.sh" 2>/dev/null; then
        SENSOR_WIRED=true
      fi
    fi
    if $SENSOR_WIRED; then
      pass "Config/env-var CI drift ($CONFIG_COUNT occurrences) — sensor wired into harness"
    else
      gap "Config/env-var changes breaking CI ($CONFIG_COUNT occurrences) — no computational sensor"
      add_gap "Config/env-var CI drift" "accuracy-guardrails.md" "ci-workflow-validator.sh"
    fi
  else
    pass "Config/env-var CI drift ($CONFIG_COUNT occurrences — below threshold)"
  fi

  # Merge conflicts
  MERGE_COUNT=$(grep -c 'merge conflict\|both modified same' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$MERGE_COUNT" -ge 2 ]; then
    gap "Merge conflicts on hot files ($MERGE_COUNT occurrences) — no sensor"
    add_gap "Hot file merge conflicts" "AGENTS.md:hot files list" "branch-overlap-check.sh"
  else
    pass "Merge conflicts on hot files ($MERGE_COUNT occurrences — below threshold)"
  fi

  # Stale deferrals
  DEFERRAL_COUNT=$(grep -c 'deferred\|stale.*status\|without re-verifying' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$DEFERRAL_COUNT" -ge 2 ]; then
    SENSOR_WIRED=false
    if [ -x "$PROJECT_ROOT/scripts/goap-reverify.sh" ]; then
      if grep -lq 'goap-reverify' \
           "$PROJECT_ROOT/scripts/pev-gates.sh" \
           "$PROJECT_ROOT/scripts/pre-push-hook.sh" \
           "$PROJECT_ROOT/scripts/pre-commit-hook.sh" 2>/dev/null; then
        SENSOR_WIRED=true
      fi
    fi
    if $SENSOR_WIRED; then
      pass "Stale GOAP deferrals ($DEFERRAL_COUNT occurrences) — sensor wired"
    else
      gap "Stale GOAP deferrals ($DEFERRAL_COUNT occurrences) — no sensor"
      add_gap "GOAP stale deferrals" "AGENTS.md:Re-Verification Protocol" "goap-reverify.sh"
    fi
  else
    pass "Stale GOAP deferrals ($DEFERRAL_COUNT occurrences — below threshold)"
  fi

  # Skill evals
  EVAL_COUNT=$(grep -c 'missing evals\|evals.*missing\|eval.*coverage' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$EVAL_COUNT" -ge 1 ]; then
    SENSOR_WIRED=false
    if [ -x "$PROJECT_ROOT/scripts/skill-eval-check.sh" ]; then
      if grep -lq 'skill-eval-check' \
           "$PROJECT_ROOT/scripts/pev-gates.sh" \
           "$PROJECT_ROOT/scripts/pre-push-hook.sh" \
           "$PROJECT_ROOT/scripts/pre-commit-hook.sh" 2>/dev/null; then
        SENSOR_WIRED=true
      fi
    fi
    if $SENSOR_WIRED; then
      pass "Skill eval coverage ($EVAL_COUNT occurrences) — sensor wired"
    else
      gap "Skills missing evals ($EVAL_COUNT occurrences) — no sensor"
      add_gap "Skill eval coverage" "SKILLS.md" "skill-eval-check.sh"
    fi
  else
    pass "Skill eval coverage ($EVAL_COUNT occurrences — below threshold)"
  fi

  # Docs-implementation drift
  DRIFT_COUNT=$(grep -c 'documented.*not exist\|not.*documented\|documentation drift\|phantom' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$DRIFT_COUNT" -ge 2 ]; then
    gap "Docs-implementation drift ($DRIFT_COUNT occurrences) — no sensor"
    add_gap "Docs-implementation drift" "accuracy-guardrails.md" "docs-parity-check.sh"
  else
    pass "Docs-implementation drift ($DRIFT_COUNT occurrences — below threshold)"
  fi

  # Test suite weight
  SUITE_COUNT=$(grep -c 'full test suite.*too heavy\|timed out.*300s\|incremental validation' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$SUITE_COUNT" -ge 1 ]; then
    warn "Full test suite too heavy ($SUITE_COUNT occurrences) — incremental validation not automated"
  else
    pass "Test suite weight ($SUITE_COUNT occurrences — below threshold)"
  fi

  # Research→Implement
  RESEARCH_COUNT=$(grep -c 'implement then discover.*wrong\|research.*before implement' "$LEARNINGS_FILE" 2>/dev/null || echo "0")
  if [ "$RESEARCH_COUNT" -ge 1 ]; then
    warn "Research→Implement pattern ($RESEARCH_COUNT occurrences) — no enforcement sensor"
  else
    pass "Research→Implement pattern ($RESEARCH_COUNT occurrences — below threshold)"
  fi
}

# ═════════════════════════════════════════════════════════════════
# PHASE 7: REGULATION CATEGORY COVERAGE
# ═════════════════════════════════════════════════════════════════

phase_regulation() {
  echo ""
  echo -e "${BOLD}[Phase 7] Regulation Category Coverage${NC}"

  # Maintainability
  MAINTAINABILITY_SCORE=100
  MAINTAINABILITY_NOTES=()
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

  # Architecture Fitness
  ARCH_SCORE=0
  ARCH_CEILING=100
  ARCH_CREDITS=()
  ARCH_DEDUCTIONS=()

  if [ -f "$PROJECT_ROOT/.github/workflows/ci.yml" ]; then ARCH_SCORE=$((ARCH_SCORE + 15)); ARCH_CREDITS+=("ci.yml (+15)"); fi
  if [ -f "$PROJECT_ROOT/scripts/validate-codes.sh" ]; then ARCH_SCORE=$((ARCH_SCORE + 15)); ARCH_CREDITS+=("validate-codes.sh (+15)"); fi
  if [ -d "$PROJECT_ROOT/tests/e2e" ] && find "$PROJECT_ROOT/tests/e2e" -maxdepth 3 \( -name '*.spec.ts' -o -name '*.test.ts' \) 2>/dev/null | grep -q .; then
    ARCH_SCORE=$((ARCH_SCORE + 15)); ARCH_CREDITS+=("tests/e2e (+15)")
  fi
  if grep -q 'dora-metrics\|DORA' "$PROJECT_ROOT/worker/index.ts" 2>/dev/null; then
    ARCH_SCORE=$((ARCH_SCORE + 10)); ARCH_CREDITS+=("DORA metrics (+10)")
  fi
  if [ -f "$PROJECT_ROOT/agents-docs/SKILLS.md" ]; then ARCH_SCORE=$((ARCH_SCORE + 10)); ARCH_CREDITS+=("SKILLS.md (+10)"); fi
  if [ -f "$PROJECT_ROOT/agents-docs/accuracy-guardrails.md" ]; then ARCH_SCORE=$((ARCH_SCORE + 10)); ARCH_CREDITS+=("accuracy-guardrails.md (+10)"); fi
  PEV_GATE_COUNT=$(grep -cE '^# Gate [0-9]' "$PROJECT_ROOT/scripts/pev-gates.sh" 2>/dev/null || echo 0)
  if [ "$PEV_GATE_COUNT" -ge 10 ]; then ARCH_SCORE=$((ARCH_SCORE + 10)); ARCH_CREDITS+=("pev-gates.sh ${PEV_GATE_COUNT} gates (+10)"); fi
  if [ -f "$PROJECT_ROOT/docs/INDEX.md" ]; then ARCH_SCORE=$((ARCH_SCORE + 5)); ARCH_CREDITS+=("docs/INDEX.md (+5)"); fi
  if [ -f "$PROJECT_ROOT/plans/SPEC_TEMPLATE.md" ]; then ARCH_SCORE=$((ARCH_SCORE + 5)); ARCH_CREDITS+=("SPEC_TEMPLATE.md (+5)"); fi
  if [ -f "$PROJECT_ROOT/scripts/harness-audit.sh" ]; then ARCH_SCORE=$((ARCH_SCORE + 5)); ARCH_CREDITS+=("harness-audit.sh (+5)"); fi

  # Deductions
  if [ -d "$PROJECT_ROOT/worker" ]; then
    NULL_ASSERT_COUNT=$(grep -rE '[a-zA-Z0-9_.]+![^=]' "$PROJECT_ROOT/worker" --include='*.ts' 2>/dev/null | wc -l | tr -d ' \n' || echo 0)
    NULL_PENALTY=$(( NULL_ASSERT_COUNT > 10 ? 10 : NULL_ASSERT_COUNT ))
    if [ "$NULL_PENALTY" -gt 0 ]; then
      ARCH_SCORE=$((ARCH_SCORE - NULL_PENALTY))
      ARCH_DEDUCTIONS+=("worker non-null assertions x${NULL_ASSERT_COUNT} (-${NULL_PENALTY})")
    fi
  fi

  LONG_FILE_COUNT=$(find "$PROJECT_ROOT" \
    -type d \( -name "node_modules" -o -name ".git" -o -name ".opencode" \
              -o -name "dist" -o -name ".wrangler" -o -name ".svelte-kit" \
              -o -name ".astro" -o -name "_generated" -o -name "__generated__" \
              -o -name ".cache" -o -name ".turbo" -o -name "coverage" \
              -o -name ".claude" -o -name ".gemini" -o -name "build" \) -prune \
    -o -type f -name '*.ts' -print \
    2>/dev/null | xargs wc -l 2>/dev/null | awk '$1 > 500 {n++} END {print n+0}')
  LONG_PENALTY=$(( LONG_FILE_COUNT > 2 ? 10 : LONG_FILE_COUNT * 5 ))
  if [ "$LONG_PENALTY" -gt 0 ]; then
    ARCH_SCORE=$((ARCH_SCORE - LONG_PENALTY))
    ARCH_DEDUCTIONS+=("source files >500 lines x${LONG_FILE_COUNT} (-${LONG_PENALTY})")
  fi

  [ "$ARCH_SCORE" -lt 0 ] && ARCH_SCORE=0
  [ "$ARCH_SCORE" -gt "$ARCH_CEILING" ] && ARCH_SCORE=$ARCH_CEILING

  echo "  Architecture Fitness: ${YELLOW}${ARCH_SCORE}%${NC} (ceiling ${ARCH_CEILING})"
  for note in "${ARCH_CREDITS[@]}"; do info "  credit:  $note"; done
  for note in "${ARCH_DEDUCTIONS[@]}"; do warn "  deduct:  $note"; done

  # Behaviour
  BEHAVIOUR_SCORE=40
  BEHAVIOUR_NOTES=()
  if [ ! -d "$PROJECT_ROOT/tests/unit" ]; then BEHAVIOUR_SCORE=$((BEHAVIOUR_SCORE - 15)); BEHAVIOUR_NOTES+=("unit tests missing"); fi
  if [ ! -d "$PROJECT_ROOT/tests/e2e" ]; then BEHAVIOUR_SCORE=$((BEHAVIOUR_SCORE - 15)); BEHAVIOUR_NOTES+=("e2e tests missing"); fi
  if ! find "$PROJECT_ROOT/tests" -name "*.fixture.*" -o -name "*fixture*" 2>/dev/null | grep -q .; then
    BEHAVIOUR_SCORE=$((BEHAVIOUR_SCORE - 10))
    BEHAVIOUR_NOTES+=("no approved fixtures pattern found")
  fi
  echo "  Behaviour: ${YELLOW}$BEHAVIOUR_SCORE%${NC}"
  for note in "${BEHAVIOUR_NOTES[@]}"; do
    warn "  $note"
  done

  # Export for JSON output
  ARCH_CREDITS_JSON="[]"
  if [ ${#ARCH_CREDITS[@]} -gt 0 ]; then
    ARCH_CREDITS_JSON="["
    for i in "${!ARCH_CREDITS[@]}"; do
      [ "$i" -gt 0 ] && ARCH_CREDITS_JSON+=","
      ARCH_CREDITS_JSON+="\"${ARCH_CREDITS[$i]}\""
    done
    ARCH_CREDITS_JSON+="]"
  fi
  ARCH_DEDUCTIONS_JSON="[]"
  if [ ${#ARCH_DEDUCTIONS[@]} -gt 0 ]; then
    ARCH_DEDUCTIONS_JSON="["
    for i in "${!ARCH_DEDUCTIONS[@]}"; do
      [ "$i" -gt 0 ] && ARCH_DEDUCTIONS_JSON+=","
      ARCH_DEDUCTIONS_JSON+="\"${ARCH_DEDUCTIONS[$i]}\""
    done
    ARCH_DEDUCTIONS_JSON+="]"
  fi
}

# ═════════════════════════════════════════════════════════════════
# PHASE 8: COHERENCE CHECK
# ═════════════════════════════════════════════════════════════════

phase_coherence() {
  echo ""
  echo -e "${BOLD}[Phase 8] Coherence: Guide↔Sensor Consistency${NC}"

  if grep -q "x!.*non-null assertion.*forbidden" "$PROJECT_ROOT/AGENTS.md" 2>/dev/null; then
    if cat "$PROJECT_ROOT"/.eslintrc* "$PROJECT_ROOT"/eslint.config* "$PROJECT_ROOT"/tsconfig.json 2>/dev/null | grep -q "no-non-null-assertion\|non-null-assertion"; then
      pass "Non-null assertion guide has matching lint sensor"
    else
      warn "Non-null assertion guide exists but no lint rule found"
    fi
  fi

  if grep -q "MAX_LINES_PER_SOURCE_FILE=500" "$PROJECT_ROOT/agents-docs/hard-constraints.md" 2>/dev/null; then
    if [ -f "$PROJECT_ROOT/scripts/quality_gate.sh" ] || [ -f "$PROJECT_ROOT/scripts/pre-commit-hook.sh" ]; then
      pass "500-line limit guide has matching sensor"
    else
      warn "500-line limit guide exists but sensors are missing"
    fi
  fi

  if grep -q "Fix-Forward" "$PROJECT_ROOT/agents-docs/accuracy-guardrails.md" 2>/dev/null; then
    $VERBOSE && info "Fix-Forward rule is inferential — no computational sensor (by design)"
  fi
}
