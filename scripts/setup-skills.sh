#!/usr/bin/env bash
# Setup Skills - Creates symlinks for all agent CLI skill directories
# Creates .claude/skills/, .gemini/skills/, .qwen/skills/ symlinks to ../../.agents/skills/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SKILLS_SOURCE="${ROOT_DIR}/.agents/skills"

# Agent directories to set up
AGENTS=(".claude" ".gemini" ".qwen")

ERRORS=()
CREATED=()
SKIPPED=()

echo "🔧 Setting up skill symlinks..."
echo ""

# Verify skills source directory exists
if [[ ! -d "$SKILLS_SOURCE" ]]; then
    echo "❌ Skills source directory not found: $SKILLS_SOURCE"
    exit 1
fi

# Get list of available skills
mapfile -t SKILLS < <(find "$SKILLS_SOURCE" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)

if [[ ${#SKILLS[@]} -eq 0 ]]; then
    echo "⚠️  No skills found in $SKILLS_SOURCE"
    exit 0
fi

echo "Found ${#SKILLS[@]} skills in .agents/skills/"
echo ""

# Process each agent directory
for agent in "${AGENTS[@]}"; do
    agent_dir="${ROOT_DIR}/${agent}"
    skills_dir="${agent_dir}/skills"

    echo "📁 Setting up ${agent}/skills/..."

    # Create agent directory if it doesn't exist
    if [[ ! -d "$agent_dir" ]]; then
        mkdir -p "$agent_dir"
        echo "  ✓ Created directory: ${agent}/"
    fi

    # Create skills subdirectory if it doesn't exist
    if [[ ! -d "$skills_dir" ]]; then
        mkdir -p "$skills_dir"
        echo "  ✓ Created directory: ${agent}/skills/"
    fi

    # Create symlinks for each skill
    for skill in "${SKILLS[@]}"; do
        target="../../.agents/skills/${skill}"
        link_path="${skills_dir}/${skill}"
        rel_target="../../.agents/skills/${skill}"

        # Check if symlink already exists and is valid
        if [[ -L "$link_path" ]]; then
            if [[ -e "$link_path" ]]; then
                # Valid symlink exists
                current_target=$(readlink "$link_path")
                if [[ "$current_target" == "$rel_target" ]]; then
                    SKIPPED+=("${agent}/skills/${skill}")
                    continue
                else
                    # Wrong target, remove and recreate
                    rm "$link_path"
                fi
            else
                # Broken symlink, remove it
                rm "$link_path"
            fi
        elif [[ -e "$link_path" ]]; then
            # Something else exists (file or directory), error
            ERRORS+=("${agent}/skills/${skill} already exists and is not a symlink")
            continue
        fi

        # Create the symlink
        if ln -s "$rel_target" "$link_path" 2>/dev/null; then
            CREATED+=("${agent}/skills/${skill}")
        else
            ERRORS+=("Failed to create symlink: ${agent}/skills/${skill}")
        fi
    done

echo ""
done

# Summary
echo "📊 Summary"
echo "=========="
echo ""

if [[ ${#CREATED[@]} -gt 0 ]]; then
    echo "✅ Created ${#CREATED[@]} symlinks:"
    for item in "${CREATED[@]}"; do
        echo "  + $item"
    done
    echo ""
fi

if [[ ${#SKIPPED[@]} -gt 0 ]]; then
    echo "⏭️  Skipped ${#SKIPPED[@]} existing valid symlinks:"
    for item in "${SKIPPED[@]}"; do
        echo "  • $item"
    done
    echo ""
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
    echo "❌ Errors (${#ERRORS[@]}):"
    for error in "${ERRORS[@]}"; do
        echo "  ✗ $error"
    done
    echo ""
    exit 1
fi

echo "✅ All skill symlinks are set up correctly!"
exit 0
