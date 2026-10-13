#!/usr/bin/env bash
# Shared quality limits - single source of truth for LOC enforcement.
# Sourced by scripts/quality_gate.sh and scripts/pre-commit-hook.sh.
# AGENTS.md mirrors these values (fatal for source, warning for docs).
# See GitHub issue #914.
#
# Tests are excluded from source LOC enforcement: existing test fixtures
# (for example tests/unit/deal-registry.test.ts at 1061 lines) exceed the
# source limit by design, and worker/bot sources are currently all under
# 500 lines. Enforcement targets source growth, not test fixtures.
#
# Variables are consumed via `source` in scripts/quality_gate.sh and
# scripts/pre-commit-hook.sh; single-file analysis cannot see cross-file use.
# shellcheck disable=SC2034

# Source files must not exceed 500 lines (fatal).
readonly MAX_LINES_PER_SOURCE_FILE=500
# Warn earlier to prevent growth (source files approaching the limit).
readonly LOC_WARN_THRESHOLD=450
# Fail threshold equals the documented hard limit.
readonly LOC_FAIL_THRESHOLD=500
# Skill docs stay under 250 lines (warning).
readonly MAX_LINES_PER_SKILL_MD=250
# Agent hub doc stays under 200 lines (warning, matches AGENTS.md).
readonly MAX_LINES_AGENTS_MD=200
