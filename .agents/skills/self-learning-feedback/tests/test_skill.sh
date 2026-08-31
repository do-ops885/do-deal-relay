#!/usr/bin/env bash
#
# Test Suite for self-learning-feedback skill
# Validates skill structure, modules, and integration
#

set -e

SKILL_DIR=".agents/skills/self-learning-feedback"
TEST_RESULTS=()
FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_section() {
    echo ""
    echo -e "${BLUE}▶ $1${NC}"
}

log_pass() {
    echo -e "${GREEN}  ✓${NC} $1"
}

log_fail() {
    echo -e "${RED}  ✗${NC} $1"
}

log_info() {
    echo -e "${YELLOW}  ℹ${NC} $1"
}

# Test 1: Module structure
test_modules() {
    log_section "Test 1: 3-Persona Module Structure"

    local modules=("verify" "score" "learn" "improve")
    for mod in "${modules[@]}"; do
        if [[ -f "$SKILL_DIR/modules/$mod.md" ]]; then
            log_pass "Module exists: $mod.md"
        else
            log_fail "Missing module: $mod.md"
            ((FAILED++))
        fi
    done
}

# Test 2: Version consistency (skill-independent per ADR-024)
test_version() {
    log_section "Test 2: Skill Version Is Valid Semver (Skill-Independent per ADR-024)"

    local skill_version=$(grep -E "^version:" "$SKILL_DIR/SKILL.md" 2>/dev/null | sed 's/version: *//' | tr -d '[:space:]')
    if echo "$skill_version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        log_pass "Skill version ($skill_version) is valid semver"
    else
        log_fail "Skill version missing or not semver: '$skill_version'"
        ((FAILED++))
        return
    fi

    local evals_version=$(python3 -c "import json; print(json.load(open('$SKILL_DIR/evals/evals.json'))['version'])" 2>/dev/null || echo "")
    if [[ "$skill_version" == "$evals_version" ]]; then
        log_pass "evals.json version ($evals_version) tracks SKILL.md"
    else
        log_fail "evals.json version ($evals_version) != SKILL.md ($skill_version)"
        ((FAILED++))
    fi

    # Product VERSION is independent — informational only
    local product_version=$(cat VERSION 2>/dev/null | tr -d '[:space:]' || echo "unknown")
    log_info "Product VERSION is $product_version (independent from skill)"
}

# Test 3: Frontmatter
test_frontmatter() {
    log_section "Test 3: SKILL.md Frontmatter"

    local required=("name: self-learning-feedback" "description:" "version:" "tags:")
    for field in "${required[@]}"; do
        if grep -q "$field" "$SKILL_DIR/SKILL.md"; then
            log_pass "Frontmatter has: $field"
        else
            log_fail "Missing frontmatter: $field"
            ((FAILED++))
        fi
    done
}

# Test 4: Analysis Swarm integration
test_swarm_pattern() {
    log_section "Test 4: ANALYSIS SWARM Pattern Integration"

    # Check RYAN module mentions
    if grep -q "RYAN\|verify\|risk\|correctness" "$SKILL_DIR/modules/verify.md"; then
        log_pass "RYAN module (verify) has correct focus"
    else
        log_fail "RYAN module missing key concepts"
        ((FAILED++))
    fi

    # Check FLASH module mentions
    if grep -q "FLASH\|score\|speed\|noise" "$SKILL_DIR/modules/score.md"; then
        log_pass "FLASH module (score) has correct focus"
    else
        log_fail "FLASH module missing key concepts"
        ((FAILED++))
    fi

    # Check SOCRATES module mentions
    if grep -q "SOCRATES\|learn\|question\|assumption" "$SKILL_DIR/modules/learn.md"; then
        log_pass "SOCRATES module (learn) has correct focus"
    else
        log_fail "SOCRATES module missing key concepts"
        ((FAILED++))
    fi

    # Check SYNTHESIS module mentions
    if grep -q "SYNTHESIS\|improve\|recommend\|trade-off" "$SKILL_DIR/modules/improve.md"; then
        log_pass "SYNTHESIS module (improve) has correct focus"
    else
        log_fail "SYNTHESIS module missing key concepts"
        ((FAILED++))
    fi
}

# Test 5: Scripts exist
test_scripts() {
    log_section "Test 5: Verification Scripts"

    local scripts=(
        "verify_version_consistency.sh"
        "verify_status_accuracy.sh"
        "verify_todo_alignment.sh"
        "verify_cross_references.sh"
        "verify_typo_misleading.sh"
        "score_noise_level.sh"
        "score_output.sh"
        "score_batch.sh"
        "capture_lesson.sh"
        "suggest_fixes.sh"
        "auto_correct.sh"
        "report_issues.sh"
        "quick_verify.sh"
        "verify_file.sh"
    )

    for script in "${scripts[@]}"; do
        if [[ -f "$SKILL_DIR/scripts/$script" ]]; then
            log_pass "Script exists: $script"
        else
            log_fail "Missing required script: $script"
            ((FAILED++))
        fi
    done
}

# Test 6: Real usage - version check
test_real_usage() {
    log_section "Test 6: Real Usage - Version Verification"

    # Check for v1.0.0 template defaults in product docs (outside skills, excluding historical reports/archived)
    local v1_claims=$(grep -r "v1\.0\.0\|version.*1\.0\.0" --include="*.md" . 2>/dev/null | grep -v node_modules | grep -v ".agents/skills/" | grep -v "reports/" | grep -v "archived" | wc -l || echo "0")

    if [[ $v1_claims -eq 0 ]]; then
        log_pass "No v1.0.0 template claims found outside skills (skill-independent mode, excluding historical)"
    else
        log_fail "Found $v1_claims v1.0.0 claims outside skills that should be product VERSION"
        log_info "Run: grep -r 'v1\\.0\\.0' --include='*.md' . | grep -v node_modules | grep -v .agents/skills | grep -v reports"
        ((FAILED++))
    fi

    # Also check skill-independent verify passes
    if bash "$SKILL_DIR/scripts/verify_version_consistency.sh" --skill-independent >/dev/null 2>&1; then
        log_pass "verify_version_consistency --skill-independent passes"
    else
        log_fail "verify_version_consistency --skill-independent reports failures"
        ((FAILED++))
    fi
}

# Test 7: LESSONS.md exists
test_lessons() {
    log_section "Test 7: Learned Lessons Integration"

    if [[ -f "agents-docs/LESSONS.md" ]]; then
        log_pass "LESSONS.md exists for institutional knowledge"
        local lessons_count=$(grep -c "LESSON-" agents-docs/LESSONS.md 2>/dev/null || echo "0")
        log_info "Found $lessons_count documented lessons"
    else
        log_info "LESSONS.md optional but recommended"
    fi
}

# Test 8: Evals configuration
test_evals() {
    log_section "Test 8: Evals Configuration"

    if [[ -f "$SKILL_DIR/evals/evals.json" ]]; then
        log_pass "Evals file exists"

        # Check JSON validity
        if python3 -c "import json; json.load(open('$SKILL_DIR/evals/evals.json'))" 2>/dev/null; then
            log_pass "Evals JSON is valid"
        else
            log_fail "Evals JSON is invalid"
            ((FAILED++))
        fi
    else
        log_fail "Missing evals.json"
        ((FAILED++))
    fi
}

# Main
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║  self-learning-feedback Skill Test Suite                ║"
    echo "║  ANALYSIS SWARM Pattern Validation                      ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""

    test_modules
    test_version
    test_frontmatter
    test_swarm_pattern
    test_scripts
    test_real_usage
    test_lessons
    test_evals

    echo ""
    echo "═══════════════════════════════════════════════════════════"
    if [[ $FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Run real verification: bash $SKILL_DIR/scripts/verify_version_consistency.sh"
        echo "  2. Score outputs: bash $SKILL_DIR/scripts/score_noise_level.sh <file>"
        echo "  3. Capture lessons: bash $SKILL_DIR/scripts/capture_lesson.sh"
        exit 0
    else
        echo -e "${RED}$FAILED test(s) failed${NC}"
        exit 1
    fi
}

main "$@"
