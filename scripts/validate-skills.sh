#!/usr/bin/env bash
# Validate Skills - Checks all symlinks in .claude/skills/, .gemini/skills/, .qwen/skills/
# Reports broken or missing symlinks, exits with appropriate status codes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SKILLS_SOURCE="${ROOT_DIR}/.agents/skills"

# Agent directories to validate
AGENTS=(".claude" ".gemini" ".qwen")

BROKEN=()
MISSING=()
VALID=()
ERRORS=()

# Get expected skills from source directory
if [[ -d "$SKILLS_SOURCE" ]]; then
    mapfile -t EXPECTED_SKILLS < <(find "$SKILLS_SOURCE" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
else
    echo "❌ Skills source directory not found: $SKILLS_SOURCE"
    exit 2
fi

# Validate each agent directory
for agent in "${AGENTS[@]}"; do
    agent_dir="${ROOT_DIR}/${agent}"
    skills_dir="${agent_dir}/skills"

    # Skip if agent directory doesn't exist
    if [[ ! -d "$agent_dir" ]]; then
        ERRORS+=("${agent}/ directory does not exist")
        continue
    fi

    # Skip if skills directory doesn't exist
    if [[ ! -d "$skills_dir" ]]; then
        ERRORS+=("${agent}/skills/ directory does not exist")
        continue
    fi

    # Check each expected skill
    for skill in "${EXPECTED_SKILLS[@]}"; do
        link_path="${skills_dir}/${skill}"
        expected_target="../../.agents/skills/${skill}"

        if [[ -L "$link_path" ]]; then
            # It's a symlink, check if valid
            if [[ -e "$link_path" ]]; then
                # Valid symlink, check target
                actual_target=$(readlink "$link_path")
                if [[ "$actual_target" == "$expected_target" ]]; then
                    VALID+=("${agent}/skills/${skill}")
                else
                    BROKEN+=("${agent}/skills/${skill} (wrong target: $actual_target, expected: $expected_target)")
                fi
            else
                # Broken symlink (points to non-existent target)
                BROKEN+=("${agent}/skills/${skill} (broken symlink)")
            fi
        elif [[ -e "$link_path" ]]; then
            # Exists but not a symlink
            BROKEN+=("${agent}/skills/${skill} (not a symlink - regular file/directory)")
        else
            # Missing entirely
            MISSING+=("${agent}/skills/${skill}")
        fi
    done
done

# Check for unexpected extra symlinks (orphaned skills)
for agent in "${AGENTS[@]}"; do
    agent_dir="${ROOT_DIR}/${agent}"
    skills_dir="${agent_dir}/skills"

    if [[ ! -d "$skills_dir" ]]; then
        continue
    fi

    mapfile -t ACTUAL_SKILLS < <(find "$skills_dir" -mindepth 1 -maxdepth 1 -type l -exec basename {} \; 2>/dev/null | sort)

    for skill in "${ACTUAL_SKILLS[@]}"; do
        # Check if this skill is in the expected list
        if [[ ! " ${EXPECTED_SKILLS[*]} " =~ " ${skill} " ]]; then
            BROKEN+=("${agent}/skills/${skill} (orphaned - skill removed from source)")
        fi
    done
done

# Report results
echo "📋 Skill Symlink Validation Report"
echo "===================================="
echo ""

if [[ ${#VALID[@]} -gt 0 ]]; then
    echo "✅ Valid symlinks: ${#VALID[@]}"
    if [[ ${#VALID[@]} -le 10 ]]; then
        for item in "${VALID[@]}"; do
            echo "  • $item"
        done
    else
        echo "  (too many to display)"
    fi
    echo ""
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo "⚠️  Missing symlinks: ${#MISSING[@]}"
    for item in "${MISSING[@]}"; do
        echo "  ✗ $item"
    done
    echo ""
fi

if [[ ${#BROKEN[@]} -gt 0 ]]; then
    echo "❌ Broken/Invalid symlinks: ${#BROKEN[@]}"
    for item in "${BROKEN[@]}"; do
        echo "  ✗ $item"
    done
    echo ""
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
    echo "❌ Directory errors: ${#ERRORS[@]}"
    for error in "${ERRORS[@]}"; do
        echo "  ✗ $error"
    done
    echo ""
fi

# Exit with appropriate code
if [[ ${#BROKEN[@]} -gt 0 ]] || [[ ${#MISSING[@]} -gt 0 ]] || [[ ${#ERRORS[@]} -gt 0 ]]; then
    TOTAL_ISSUES=$(( ${#BROKEN[@]} + ${#MISSING[@]} + ${#ERRORS[@]} ))
    echo "❌ Validation failed: $TOTAL_ISSUES issue(s) found"
    echo ""
    echo "To fix, run: ./scripts/setup-skills.sh"
    exit 1
fi

echo "✅ All ${#VALID[@]} skill symlinks are valid!"
exit 0
