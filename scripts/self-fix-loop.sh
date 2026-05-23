#!/usr/bin/env bash
# Self-Fix Loop - commit, push, monitor, fix cycle
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [[ -f ".agents/config.sh" ]]; then
    source ".agents/config.sh"
fi

main() {
    log_info "Starting Self-Fix Loop..."

    if ./scripts/quality_gate.sh; then
        log_success "Quality gate passed. No fix needed."
        exit 0
    fi

    log_error "Failures detected. Autonomous fix loop requires active orchestration."
    log_error "Agent should manually execute fix steps if scripts are not fully automated."
    exit 1
}

main
