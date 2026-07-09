#!/usr/bin/env bash
# Enhanced Pre-Commit Guard Rails - Matches GitHub Actions CI Pipeline
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ERRORS=0; WARNINGS=0
echo "🛡️  Running pre-commit guard rails..."; echo ""
error() { echo -e "${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warning() { echo -e "${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
success() { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)
[ -z "$STAGED_FILES" ] && { info "No files staged for commit"; exit 0; }
STAGED_COUNT=$(echo "$STAGED_FILES" | wc -l | tr -d ' ')
info "Checking ${STAGED_COUNT} staged file(s)..."; echo ""
echo "Guard Rail 1: Blocked File Patterns"
BLOCKED_PATTERNS=("*.env*" "*.key" "*.pem" "*.p12" "*.pfx" "*secret*" "*password*" "*credential*" "node_modules/" "coverage/" "dist/" "build/")
BLOCKED_FOUND=0
for pattern in "${BLOCKED_PATTERNS[@]}"; do
    escaped_pattern=$(printf '%s' "$pattern" | sed 's/\([.+^${}()|\\]\)/\\\1/g; s/\*/.*/g')
    if echo "$STAGED_FILES" | grep -qE "$escaped_pattern"; then error "Attempting to commit blocked pattern: $pattern"; BLOCKED_FOUND=1; fi
done
[ $BLOCKED_FOUND -eq 0 ] && success "No blocked file patterns found"
echo ""; echo "Guard Rail 2: Secret Detection"
SECRETS_FOUND=0; PATTERN_COUNT=0
check_pattern() {
    local pattern="$1"; local name="$2"; PATTERN_COUNT=$((PATTERN_COUNT + 1))
    local MATCHES
    MATCHES=$(git diff --cached 2>/dev/null | grep -vE "^[-+@ ]*(#|//|\*|--|<!--)" | grep -v "check_pattern" | grep -vE "^\s*-\s*" | grep -vE "https?://" | grep -vE "dash\.cloudflare\.com" | grep -vE "^[+#= ]*$" | grep -vE "\$[a-z]+://" | grep -vE "^\s*\$ref:" | grep -vE "#/components/" | grep -vE "(whsec_test|ghp_test|sk_test|test_secret|whsec_secret|whsec_old|whsec_fake|whsec_mock)" | grep -vE "(mock|test|fake|demo|sample)_?(key|secret|token|password|api.?key)" | grep -vE "test.*(key|secret|hash|password)" | grep -vE "(key|secret|hash|password).*test" | grep -vE "INSERT.*test" | grep -vE "console\.log" | grep -vE "uses:\s*[a-zA-Z0-9/-]+@[a-f0-9]{40}" | grep -vE "^diff --git " | grep -vE "^index [0-9a-f]+\.\." | grep -vE "^(\+\+\+|---) [ab]/" | grep -E "$pattern" || true)
    if [ -n "$MATCHES" ]; then error "Potential secret detected ($name):"; echo "  $MATCHES" | head -3; SECRETS_FOUND=1; fi
}
check_pattern "ghp_[a-zA-Z0-9]{36}" "GitHub PAT"
check_pattern "gho_[a-zA-Z0-9]{36}" "GitHub OAuth"
check_pattern "ghs_[a-zA-Z0-9]{36}" "GitHub Server-to-Server"
check_pattern "sk-[a-zA-Z0-9]{48}" "Stripe Secret"
check_pattern "sk_live_[a-zA-Z0-9]{24,}" "Stripe Live"
check_pattern "sk_test_[a-zA-Z0-9]{24,}" "Stripe Test"
check_pattern "AKIA[0-9A-Z]{16}" "AWS Access Key"
check_pattern "ASIA[0-9A-Z]{16}" "AWS Session"
check_pattern "[A-Za-z0-9/+=]{40}" "Generic base64 secret"
check_pattern "bearer\s+[a-zA-Z0-9_-]{20,}" "Bearer token"
check_pattern "api[_-]?key\s*[=:]\s*[\"'][^\"']{8,}[\"']" "API key assignment"
check_pattern "password\s*[=:]\s*[\"'][^\"']{8,}[\"']" "Password assignment"
check_pattern "secret\s*[=:]\s*[\"'][^\"']{8,}[\"']" "Secret assignment"
check_pattern "BEGIN \(RSA\|EC\|DSA\|OPENSSH\) PRIVATE KEY" "Private key"
check_pattern "BEGIN PGP PRIVATE KEY" "PGP key"
if [ $SECRETS_FOUND -ne 0 ]; then error "COMMIT BLOCKED: Secrets detected in staged changes"; exit 1; fi
success "No secrets detected ($PATTERN_COUNT patterns checked)"
echo ""; echo "Guard Rail 3: File Size Limits"
MAX_SIZE=$((10 * 1024 * 1024)); OVERSIZED=0
while IFS= read -r file; do
    if [ -f "$file" ]; then
        SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
        if [ "$SIZE" -gt "$MAX_SIZE" ]; then error "File exceeds size limit: $file"; OVERSIZED=1; fi
    fi
done <<< "$STAGED_FILES"
[ $OVERSIZED -eq 0 ] && success "All files within size limits"
echo ""; echo "Guard Rail 4: Line Count Limits"
MAX_LINES_TS=500; MAX_LINES_SKILL=250; MAX_LINES_AGENTS=150; LINE_VIOLATIONS=0
while IFS= read -r file; do
    if [ -f "$file" ]; then
        LINES=$(wc -l < "$file")
        if [[ "$file" == *.ts ]] || [[ "$file" == *.js ]]; then [ "$LINES" -gt $MAX_LINES_TS ] && { warning "$file has $LINES lines (max $MAX_LINES_TS)"; LINE_VIOLATIONS=$((LINE_VIOLATIONS + 1)); }; fi
        if [[ "$file" == */SKILL.md ]]; then [ "$LINES" -gt $MAX_LINES_SKILL ] && { warning "$file has $LINES lines (max $MAX_LINES_SKILL)"; LINE_VIOLATIONS=$((LINE_VIOLATIONS + 1)); }; fi
        if [[ "$file" == "AGENTS.md" ]]; then [ "$LINES" -gt $MAX_LINES_AGENTS ] && { warning "AGENTS.md has $LINES lines (max $MAX_LINES_AGENTS)"; LINE_VIOLATIONS=$((LINE_VIOLATIONS + 1)); }; fi
    fi
done <<< "$STAGED_FILES"
[ $LINE_VIOLATIONS -eq 0 ] && success "Line count check complete" || warning "$LINE_VIOLATIONS file(s) exceed line limit"
echo ""; echo "Guard Rail 5: Dependency Directory Check"
DEPS_STAGED=0
while IFS= read -r file; do
    case "$file" in node_modules/*|vendor/*|dist/*|build/*|coverage/*|.next/*|.nuxt/*) error "Dependency/build file staged: $file"; DEPS_STAGED=1 ;; esac
done <<< "$STAGED_FILES"
[ $DEPS_STAGED -eq 0 ] && success "No dependency/build files staged"
echo ""; echo "Guard Rail 6: Code Quality"
MD_FILES=$(echo "$STAGED_FILES" | grep -E '\.md$' || true)
if [ -n "$MD_FILES" ]; then
    info "Checking markdown lint..."; MD_ERRORS=0
    while IFS= read -r file; do
        if [ -f "$file" ] && ! npx markdownlint-cli --config .markdownlint.json "$file" >/dev/null 2>&1; then error "Markdown lint issue in: $file"; MD_ERRORS=1; fi
    done <<< "$MD_FILES"
    [ $MD_ERRORS -eq 0 ] && success "All staged markdown files pass lint"
fi
PRETTIER_FILES=$(echo "$STAGED_FILES" | grep -E '\.(ts|js|json|yaml|yml|md)$' || true)
if [ -n "$PRETTIER_FILES" ]; then
    info "Checking formatting..."; FORMAT_ERRORS=0
    while IFS= read -r file; do
        if [ -f "$file" ] && ! npx prettier --check "$file" >/dev/null 2>&1; then warning "Formatting issue in: $file"; FORMAT_ERRORS=1; fi
    done <<< "$PRETTIER_FILES"
    [ $FORMAT_ERRORS -eq 0 ] && success "All staged files are properly formatted"
fi
if echo "$STAGED_FILES" | grep -qE "\.(ts|tsx|js|jsx)$"; then
    info "TypeScript/JavaScript changes - running checks..."
    if npx tsc --noEmit >/dev/null 2>&1; then success "TypeScript compilation passed"
    else error "TypeScript compilation failed"; fi
    if npm run test:ci >/tmp/ddr-test-ci.log 2>&1; then success "Tests passing"
    else error "Tests failed"; tail -10 /tmp/ddr-test-ci.log; fi
fi
echo ""; echo "Guard Rail 7: Syntax Validation"
JSON_ERRORS=0; YAML_ERRORS=0
while IFS= read -r file; do
    if [[ "$file" == *.json ]] && ! python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then error "Invalid JSON: $file"; JSON_ERRORS=1; fi
    if { [[ "$file" == *.yml ]] || [[ "$file" == *.yaml ]]; } && ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then error "Invalid YAML: $file"; YAML_ERRORS=1; fi
done <<< "$STAGED_FILES"
[ $JSON_ERRORS -eq 0 ] && [ $YAML_ERRORS -eq 0 ] && success "All JSON/YAML files are valid"
echo ""; echo "Guard Rail 8: Root Directory File Organization"
ALLOWED_ROOT_FILES=("AGENTS.md" "README.md" "LICENSE" "package.json" "package-lock.json" "tsconfig.json" "vitest.config.ts" "wrangler.jsonc" "wrangler.toml" "VERSION" ".gitignore" ".gitattributes" ".editorconfig" ".prettierrc" ".prettierignore" "commitlint.config.cjs" ".eslintrc*" ".nvmrc" ".node-version" "Dockerfile" "docker-compose.yml" "Makefile" ".codesandbox" ".devcontainer" ".pre-commit-config.yaml" ".codacy.yml" ".codacy.yaml")
ROOT_VIOLATIONS=0
while IFS= read -r file; do
    if [[ "$file" != */* ]] && [ -f "$file" ]; then
        ALLOWED=0; for allowed in "${ALLOWED_ROOT_FILES[@]}"; do if [[ "$file" == $allowed ]]; then ALLOWED=1; break; fi; done
        if [ $ALLOWED -eq 0 ]; then error "File in root not in allowed list: $file"; ROOT_VIOLATIONS=1; fi
    fi
done <<< "$STAGED_FILES"
[ $ROOT_VIOLATIONS -eq 0 ] && success "Root directory organization is valid"
echo ""; echo "Guard Rail 9: Directory Organization"
MISPLACED=0
while IFS= read -r file; do
    if [[ "$file" == *.md ]] && [[ "$file" != "README.md" ]] && [[ "$file" != "AGENTS.md" ]] && [[ "$file" != "LICENSE" ]]; then
        if [[ "$file" != docs/* ]] && [[ "$file" != agents-docs/* ]]; then warning "Markdown file outside docs/: $file"; MISPLACED=1; fi
    fi
    if [[ "$file" == *.sh ]] && [[ "$file" != scripts/* ]] && [[ "$file" != tests/* ]] && [[ "$file" != .agents/skills/*/scripts/* ]] && [[ "$file" != .agents/skills/*/examples/* ]]; then error "Shell script outside allowed directories: $file"; MISPLACED=1; fi
done <<< "$STAGED_FILES"
[ $MISPLACED -eq 0 ] && success "Directory organization is valid"
echo ""; echo "Guard Rail 10: Skill Eval Freshness"
SKILL_EVALS_REGEN=0
while IFS= read -r file; do
    if [[ "$file" == .agents/skills/*/SKILL.md ]] || [[ "$file" == .agents/skills/*/scripts/*.sh ]] || [[ "$file" == .agents/skills/*/references/*.md ]]; then
        SKILL_DIR=$(echo "$file" | cut -d/ -f1-4); EVALS_FILE="$SKILL_DIR/evals/evals.json"; GEN_SCRIPT="$SKILL_DIR/scripts/generate_evals.py"
        if [ -f "$GEN_SCRIPT" ] && [ -f "$EVALS_FILE" ]; then
            cp "$EVALS_FILE" /tmp/evals-before.json 2>/dev/null || true
            python3 "$GEN_SCRIPT" > /dev/null 2>&1
            if [ -f /tmp/evals-before.json ] && ! diff -q "$EVALS_FILE" /tmp/evals-before.json > /dev/null 2>&1; then git add "$EVALS_FILE"; info "evals.json regenerated for $file"; SKILL_EVALS_REGEN=1; fi
        fi
    fi
done <<< "$STAGED_FILES"
[ $SKILL_EVALS_REGEN -eq 0 ] && success "All skill evals fresh"
echo ""; echo "Guard Rail 11: GitHub Actions Workflow Validation"
if echo "$STAGED_FILES" | grep -q ".github/workflows"; then
    info "Workflow files changed - validating..."; if command -v actionlint >/dev/null 2>&1; then if actionlint .github/workflows/*.yml 2>&1; then success "Workflow validation passed"; else error "Workflow validation failed"; fi; else warning "actionlint not installed"; fi
fi
echo ""; echo "=================================="; echo "Guard Rails Summary"; echo "=================================="
echo "Errors: $ERRORS"; echo "Warnings: $WARNINGS"; echo ""
if [ $ERRORS -gt 0 ]; then echo -e "${RED}✗ COMMIT BLOCKED${NC}"; exit 1; fi
echo -e "${GREEN}✓ ALL GUARD RAILS PASSED${NC}"; [ $WARNINGS -gt 0 ] && echo -e "${YELLOW}⚠ COMMIT ALLOWED WITH WARNINGS${NC}" || echo "Safe to commit!"; exit 0
