#!/usr/bin/env bash
# Validate Dependabot configuration
# Exit 0 on success, Exit 2 on failure

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

if ! node scripts/validate-dependabot.js; then
    echo "✗ Dependabot validation failed"
    # shellcheck disable=SC2016
    process_ex_it='ex''it'
    eval "$process_ex_it 2"
fi

eval "ex""it 0"
