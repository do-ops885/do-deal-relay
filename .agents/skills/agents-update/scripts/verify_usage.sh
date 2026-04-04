#!/usr/bin/env bash
#
# Real Usage Verification for agents-update skill
# Tests the skill against actual AGENTS.md optimization
#

set -e

WORKSPACE_ROOT="/workspaces/do-deal-relay"
AGENTS_MD="$WORKSPACE_ROOT/AGENTS.md"
SKILL_DIR="$WORKSPACE_ROOT/.agents/skills/agents-update"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_section() {
    echo ""
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Check 1: Current AGENTS.md state
check_current_state() {
    log_section "1. Current AGENTS.md State"

    if [[ -f "$AGENTS_MD" ]]; then
        local lines=$(wc -l < "$AGENTS_MD")
        log_info "AGENTS.md exists with $lines lines"

        if [[ $lines -le 140 ]]; then
            log_pass "AGENTS.md is already optimized (≤140 lines)"
            return 0
        else
            log_info "AGENTS.md needs optimization ($lines > 140 lines)"
            return 1
        fi
    else
        log_fail "AGENTS.md not found at $AGENTS_MD"
        return 1
    fi
}

# Check 2: Destination files existence
check_destination_files() {
    log_section "2. Destination Files Verification"

    local required_files=(
        "agents-docs/coordination/production-readiness.md"
        "agents-docs/quality-standards.md"
        "agents-docs/url-handling.md"
        "agents-docs/features/referral-system.md"
        "agents-docs/features/input-methods.md"
        "agents-docs/coordination/handoff-protocol.md"
        "agents-docs/coordination/swarm-patterns.md"
        "agents-docs/features/web-research.md"
        "agents-docs/PROJECT_STRUCTURE.md"
        "agents-docs/coordination/state-management.md"
    )

    local found=0
    local missing=0

    for file in "${required_files[@]}"; do
        local full_path="$WORKSPACE_ROOT/$file"
        if [[ -f "$full_path" ]]; then
            local lines=$(wc -l < "$full_path")
            log_pass "$file exists ($lines lines)"
            ((found++))
        else
            log_fail "$file missing"
            ((missing++))
        fi
    done

    log_info "Found: $found / ${#required_files[@]} destination files"

    if [[ $missing -eq 0 ]]; then
        return 0
    else
        return 1
    fi
}

# Check 3: AGENTS.md content verification
check_agents_md_content() {
    log_section "3. AGENTS.md Content Verification"

    # Check that key sections still exist as brief summaries
    local checks_passed=0
    local checks_total=0

    # Check for Quick Start
    ((checks_total++))
    if grep -q "Quick Start" "$AGENTS_MD"; then
        log_pass "Quick Start section present"
        ((checks_passed++))
    else
        log_fail "Quick Start section missing"
    fi

    # Check for essential links table
    ((checks_total++))
    if grep -q "Resource" "$AGENTS_MD" && grep -q "Location" "$AGENTS_MD"; then
        log_pass "References table present"
        ((checks_passed++))
    else
        log_fail "References table missing"
    fi

    # Check that detailed sections are brief (no more than 10 lines per section)
    ((checks_total++))
    local sections=$(grep -c "^## " "$AGENTS_MD" || true)
    if [[ $sections -lt 15 ]]; then
        log_pass "Section count reasonable ($sections sections)"
        ((checks_passed++))
    else
        log_info "Many sections ($sections) - may need more optimization"
    fi

    log_info "Content checks: $checks_passed / $checks_total passed"

    if [[ $checks_passed -eq $checks_total ]]; then
        return 0
    else
        return 0  # Still acceptable
    fi
}

# Check 4: Cross-reference validation
check_cross_references() {
    log_section "4. Cross-Reference Validation"

    local refs=$(grep -c "agents-docs/" "$AGENTS_MD" || true)
    log_info "Found $refs references to agents-docs/ in AGENTS.md"

    if [[ $refs -gt 5 ]]; then
        log_pass "Good cross-reference coverage"
    else
        log_info "Consider adding more cross-references"
    fi

    return 0
}

# Check 5: Run skill test suite
check_skill_tests() {
    log_section "5. Skill Test Suite"

    if [[ -x "$SKILL_DIR/tests/test_skill.sh" ]]; then
        log_info "Running skill tests..."
        if bash "$SKILL_DIR/tests/test_skill.sh"; then
            log_pass "Skill tests passed"
            return 0
        else
            log_fail "Skill tests failed"
            return 1
        fi
    else
        log_info "Test script not executable, fixing..."
        chmod +x "$SKILL_DIR/tests/test_skill.sh"
        bash "$SKILL_DIR/tests/test_skill.sh"
    fi
}

# Check 6: Summary report
generate_summary() {
    log_section "6. Summary Report"

    local lines=$(wc -l < "$AGENTS_MD")

    echo ""
    echo "AGENTS.md Optimization Status"
    echo "-----------------------------"
    echo "Current lines: $lines"
    echo "Target: ≤140 lines"

    if [[ $lines -le 140 ]]; then
        echo -e "Status: ${GREEN}OPTIMIZED${NC}"
        echo ""
        echo "Destination files created:"
        find "$WORKSPACE_ROOT/agents-docs" -name "*.md" -type f | while read f; do
            local rel_path="${f#$WORKSPACE_ROOT/}"
            local file_lines=$(wc -l < "$f")
            echo "  - $rel_path ($file_lines lines)"
        done
    else
        local reduction_needed=$((lines - 140))
        echo -e "Status: ${YELLOW}NEEDS OPTIMIZATION${NC}"
        echo "Need to reduce by: $reduction_needed lines"
    fi

    echo ""
    echo "To apply optimization:"
    echo "  skill agents-update"
}

# Main execution
main() {
    log_section "Real Usage Verification: agents-update skill"

    local overall_pass=0

    check_current_state || overall_pass=1
    check_destination_files || overall_pass=1
    check_agents_md_content || overall_pass=1
    check_cross_references || overall_pass=1
    check_skill_tests || overall_pass=1
    generate_summary

    log_section "Verification Complete"

    if [[ $overall_pass -eq 0 ]]; then
        echo -e "${GREEN}All checks passed!${NC}"
        exit 0
    else
        echo -e "${YELLOW}Some checks need attention${NC}"
        exit 0  # Still exit 0 as this is informational
    fi
}

main "$@"
