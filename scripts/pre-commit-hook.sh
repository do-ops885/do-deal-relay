#!/usr/bin/env bash
# Pre-commit hook - runs quality gate before every commit
# Install with: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

./scripts/quality_gate.sh
exit $?
