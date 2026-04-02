#!/usr/bin/env bash
#
# Test Suite for agents-update skill
# Validates skill structure, content, and functionality
#

set -e

SKILL_DIR=".agents/skills/agents-update"
AGENTS_MD="AGENTS.md"
TEST_RESULTS=()
FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test 1: Skill structure validation
test_skill_structure() {
    log_info "Test 1: Skill structure validation"
    
    local required_files=(
        "SKILL.md"
        "tests/test_skill.sh"
        "evals/evals.json"
    )
    
    for file in "${required_files[@]}"; do
        if [[ -f "$SKILL_DIR/$file" ]]; then
            log_pass "Required file exists: $file"
        else
            log_fail "Missing required file: $file"
            ((FAILED++))
        fi
    done
}

# Test 2: SKILL.md frontmatter validation
test_frontmatter() {
    log_info "Test 2: SKILL.md frontmatter validation"
    
    local skill_file="$SKILL_DIR/SKILL.md"
    
    # Check for required frontmatter fields
    if grep -q "^name: agents-update" "$skill_file"; then
        log_pass "Frontmatter has 'name' field"
    else
        log_fail "Missing 'name' field in frontmatter"
        ((FAILED++))
    fi
    
    if grep -q "^description:" "$skill_file"; then
        log_pass "Frontmatter has 'description' field"
    else
        log_fail "Missing 'description' field in frontmatter"
        ((FAILED++))
    fi
    
    if grep -q "^version:" "$skill_file"; then
        log_pass "Frontmatter has 'version' field"
    else
        log_fail "Missing 'version' field in frontmatter"
        ((FAILED++))
    fi
}

# Test 3: SKILL.md line count
test_skill_line_count() {
    log_info "Test 3: SKILL.md line count (should be ≤250)"
    
    local lines=$(wc -l < "$SKILL_DIR/SKILL.md")
    if [[ $lines -le 250 ]]; then
        log_pass "SKILL.md has $lines lines (≤250)"
    else
        log_fail "SKILL.md has $lines lines (>250)"
        ((FAILED++))
    fi
}

# Test 4: Section mapping table validation
test_section_mapping() {
    log_info "Test 4: Section mapping table validation"
    
    local skill_file="$SKILL_DIR/SKILL.md"
    
    # Check for key sections in mapping table
    if grep -q "Production Readiness Checklist" "$skill_file"; then
        log_pass "Mapping includes Production Readiness"
    else
        log_fail "Missing Production Readiness in mapping"
        ((FAILED++))
    fi
    
    if grep -q "agents-docs/coordination/" "$skill_file"; then
        log_pass "Mapping includes coordination targets"
    else
        log_fail "Missing coordination targets in mapping"
        ((FAILED++))
    fi
}

# Test 5: Workflow documentation
test_workflow_docs() {
    log_info "Test 5: Workflow documentation validation"
    
    local skill_file="$SKILL_DIR/SKILL.md"
    
    if grep -q "## Workflow" "$skill_file"; then
        log_pass "Has Workflow section"
    else
        log_fail "Missing Workflow section"
        ((FAILED++))
    fi
    
    if grep -q "## Quality Gates" "$skill_file"; then
        log_pass "Has Quality Gates section"
    else
        log_fail "Missing Quality Gates section"
        ((FAILED++))
    fi
}

# Test 6: Reference files check
test_reference_files() {
    log_info "Test 6: Reference files validation"
    
    if [[ -d "$SKILL_DIR/references" ]]; then
        log_pass "References directory exists"
    else
        log_info "References directory optional - skipping"
    fi
}

# Test 7: Evals configuration validation
test_evals_config() {
    log_info "Test 7: Evals configuration validation"
    
    local evals_file="$SKILL_DIR/evals/evals.json"
    
    if [[ -f "$evals_file" ]]; then
        log_pass "Evals file exists"
        
        # Check if valid JSON
        if python3 -c "import json; json.load(open('$evals_file'))" 2>/dev/null; then
            log_pass "Evals file is valid JSON"
        else
            log_fail "Evals file is not valid JSON"
            ((FAILED++))
        fi
    else
        log_fail "Missing evals.json"
        ((FAILED++))
    fi
}

# Test 8: Real usage test (if AGENTS.md exists)
test_real_usage() {
    log_info "Test 8: Real usage validation"
    
    if [[ -f "$AGENTS_MD" ]]; then
        local lines=$(wc -l < "$AGENTS_MD")
        log_info "Current AGENTS.md: $lines lines"
        
        if [[ $lines -le 140 ]]; then
            log_pass "AGENTS.md is already optimized ($lines lines)"
        else
            log_info "AGENTS.md needs optimization ($lines lines > 140)"
        fi
    else
        log_info "AGENTS.md not found - skipping real usage test"
    fi
}

# Test 9: Cross-references validation
test_cross_references() {
    log_info "Test 9: Cross-references validation"
    
    local skill_file="$SKILL_DIR/SKILL.md"
    
    # Check that skill references related files
    if grep -q "agents-docs/" "$skill_file"; then
        log_pass "Skill references agents-docs/"
    else
        log_fail "Skill should reference agents-docs/"
        ((FAILED++))
    fi
}

# Test 10: Code examples validation
test_code_examples() {
    log_info "Test 10: Code examples validation"
    
    local skill_file="$SKILL_DIR/SKILL.md"
    
    # Count code blocks
    local code_blocks=$(grep -c "^\`\`\`" "$skill_file" || true)
    if [[ $code_blocks -gt 0 ]]; then
        log_pass "Skill has code examples ($((code_blocks / 2)) blocks)"
    else
        log_fail "Skill should have code examples"
        ((FAILED++))
    fi
}

# Run all tests
main() {
    echo "================================"
    echo "agents-update Skill Test Suite"
    echo "================================"
    echo ""
    
    test_skill_structure
    test_frontmatter
    test_skill_line_count
    test_section_mapping
    test_workflow_docs
    test_reference_files
    test_evals_config
    test_real_usage
    test_cross_references
    test_code_examples
    
    echo ""
    echo "================================"
    if [[ $FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}$FAILED test(s) failed${NC}"
        exit 1
    fi
}

main "$@"
