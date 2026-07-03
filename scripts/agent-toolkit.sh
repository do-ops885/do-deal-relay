#!/usr/bin/env bash
# Agent Toolkit - Unified Operational Entry Point
# Wraps existing scripts to provide a standardized interface for agents.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

show_help() {
    echo "Agent Toolkit"
    echo "============="
    echo "Usage: ./scripts/agent-toolkit.sh [command]"
    echo ""
    echo "Commands:"
    echo "  setup      - One-command setup: install deps + skills + hooks"
    echo "  doctor     - Diagnose environment and configuration issues"
    echo "  quality    - Run the full quality gate (lint, test, validate, security)"
    echo "  validate   - Validate skill structures and symlinks"
    echo "  docs       - Update and verify repository documentation"
    echo "  analyze    - Perform automated codebase analysis"
    echo "  help       - Show this help message"
    echo ""
}

case "${1:-help}" in
    setup)
        if [ -f "${SCRIPT_DIR}/bootstrap.sh" ]; then
            bash "${SCRIPT_DIR}/bootstrap.sh"
        else
            echo "Error: bootstrap.sh not found."
            exit 1
        fi
        ;;
    doctor)
        if [ -f "${SCRIPT_DIR}/doctor.sh" ]; then
            bash "${SCRIPT_DIR}/doctor.sh"
        elif [ -f "${SCRIPT_DIR}/check-ci-status.sh" ]; then
            bash "${SCRIPT_DIR}/check-ci-status.sh"
        else
            echo "Error: No diagnostic script found."
            exit 1
        fi
        ;;
    quality)
        if [ -f "${SCRIPT_DIR}/quality_gate.sh" ]; then
            bash "${SCRIPT_DIR}/quality_gate.sh"
        else
            echo "Error: quality_gate.sh not found."
            exit 1
        fi
        ;;
    validate)
        if [ -f "${SCRIPT_DIR}/validate-skills.sh" ]; then
            bash "${SCRIPT_DIR}/validate-skills.sh"
        else
            echo "Error: validate-skills.sh not found."
            exit 1
        fi
        ;;
    docs)
        if [ -f "${SCRIPT_DIR}/update-docs.sh" ]; then
            bash "${SCRIPT_DIR}/update-docs.sh"
        else
            echo "Error: update-docs.sh not found."
            exit 1
        fi
        ;;
    analyze)
        if [ -f "${SCRIPT_DIR}/check-directory-organization.sh" ]; then
            bash "${SCRIPT_DIR}/check-directory-organization.sh"
        else
            echo "Error: check-directory-organization.sh not found."
            exit 1
        fi
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
