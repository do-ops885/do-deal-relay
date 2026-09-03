#!/usr/bin/env bash
#
# Pre-Commit Validation Guards (sourced by pre-commit-hook.sh)
# Extracted to keep pre-commit-hook.sh under the 500-line limit.
#
# Expects from caller: STAGED_FILES, error(), warning(), success(), info().
#

run_syntax_guards() {
    # GUARD RAIL 7: TypeScript Anti-Patterns
    echo "Guard Rail 7: TypeScript Anti-Patterns"

    TS_FILES=$(echo "$STAGED_FILES" | grep -E '\.ts$' || true)
    ANTI_PATTERN_FOUND=0

    if [ -n "$TS_FILES" ]; then
        while IFS= read -r file; do
            if [ -f "$file" ]; then
                if grep -qE '\w+![^=!]' "$file" 2>/dev/null; then
                    if grep -qE '\w+![/=)]' "$file" 2>/dev/null; then
                        warning "Non-null assertion (!) found in: $file"
                        warning "  ↳ Use type guard, optional chaining, or ?? fallback instead"
                        ANTI_PATTERN_FOUND=1
                    fi
                fi

                if grep -qE '\[(\d+)\]\s*!==\s*undefined' "$file" 2>/dev/null; then
                    info "Consider using ?? operator instead of !== undefined in: $file"
                fi
            fi
        done <<< "$TS_FILES"

        if [ $ANTI_PATTERN_FOUND -eq 0 ]; then
            success "No TypeScript anti-patterns detected"
        fi
    else
        success "No TypeScript files to check"
    fi
    echo ""

    # GUARD RAIL 8: JSON/YAML Syntax Validation
    echo "Guard Rail 8: Syntax Validation"

    JSON_ERRORS=0
    YAML_ERRORS=0

    while IFS= read -r file; do
        if [[ "$file" == *.json ]]; then
            if ! python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then
                error "Invalid JSON syntax: $file"
                JSON_ERRORS=1
            fi
        fi
    done <<< "$STAGED_FILES"

    while IFS= read -r file; do
        if [[ "$file" == *.yml ]] || [[ "$file" == *.yaml ]]; then
            if ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
                error "Invalid YAML syntax: $file"
                YAML_ERRORS=1
            fi
        fi
    done <<< "$STAGED_FILES"

    if [ $JSON_ERRORS -eq 0 ] && [ $YAML_ERRORS -eq 0 ]; then
        success "All JSON/YAML files are valid"
    fi
    echo ""
}

run_workflow_guard() {
    # GUARD RAIL 12: GitHub Actions Workflow Validation
    echo "Guard Rail 12: GitHub Actions Workflow Validation"

    if echo "$STAGED_FILES" | grep -q ".github/workflows"; then
        info "Workflow files changed - validating..."

        if command -v actionlint >/dev/null 2>&1; then
            if actionlint .github/workflows/*.yml 2>&1; then
                success "Workflow validation passed (actionlint)"
            else
                error "Workflow validation failed (actionlint)"
            fi
        else
            warning "actionlint not installed - skipping workflow validation"
            echo "   Install: go install github.com/rhysd/actionlint/cmd/actionlint@latest"
            echo "   Or run: docker run --rm -v \$PWD:/repo rhysd/actionlint:latest"
        fi
    else
        success "No workflow changes (skipping)"
    fi
    echo ""
}
