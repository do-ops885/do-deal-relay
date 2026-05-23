#!/usr/bin/env bash
set -euo pipefail
# Codebase Optimizer - Autonomous Analysis and Self-Learning Script
# Analyzes code, detects issues, suggests fixes, and learns from corrections.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../" && pwd)"
AGENT_DOCS="$REPO_ROOT/agents-docs"

# Source config
if [[ -f "$REPO_ROOT/.agents/config.sh" ]]; then
    source "$REPO_ROOT/.agents/config.sh"
else
    log_info() { echo "[INFO] $*"; }
    log_success() { echo "[PASS] $*"; }
    log_warning() { echo "[WARN] $*"; }
fi

init_docs() {
    mkdir -p "$AGENT_DOCS"/{patterns,issues,fixes,detected,resolved,references}
}

analyze_patterns() {
    log_info "Running pattern analysis..."

    # Check for large files
    local max_lines=${MAX_LINES_PER_SOURCE_FILE:-500}
    find worker/ -name "*.ts" -type f | while read -r file; do
        lines=$(wc -l < "$file")
        if [[ $lines -gt $max_lines ]]; then
            log_warning "Large file detected: $file ($lines lines)"
        fi
    done

    log_success "Analysis complete"
}

update_agents_md() {
    local agents_file="$REPO_ROOT/AGENTS.md"
    if [[ ! -f "$agents_file" ]]; then return; fi

    if ! grep -q "Self-Learning Rules" "$agents_file"; then
        log_info "Adding Self-Learning Rules section to AGENTS.md"
        cat >> "$agents_file" << 'EOM'

---
## Self-Learning Rules (Auto-Generated)

This section is automatically updated by `./scripts/analyze-codebase.sh`.
EOM
    fi
}

main() {
    init_docs
    analyze_patterns
    update_agents_md
}

main
