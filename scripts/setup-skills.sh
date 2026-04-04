#!/usr/bin/env bash
# Setup script to create skill symlinks for multi-agent support
# Run once after cloning: ./scripts/setup-skills.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Setting up skill symlinks for multi-agent support..."
echo ""

# Create .claude/skills/ directory with symlinks
if [ -d ".claude" ]; then
    echo "Setting up Claude Code skills..."
    mkdir -p .claude/skills

    for skill in .agents/skills/*/; do
        skill_name=$(basename "$skill")
        target="../../.agents/skills/$skill_name"
        link=".claude/skills/$skill_name"

        if [ -e "$link" ] || [ -L "$link" ]; then
            echo "  ✓ $skill_name (already exists)"
        else
            ln -s "$target" "$link"
            echo "  ✓ $skill_name (created)"
        fi
    done
    echo ""
fi

# Create .gemini/skills/ directory with symlinks
if [ ! -d ".gemini" ]; then
    echo "Creating Gemini CLI directory..."
    mkdir -p .gemini
fi

echo "Setting up Gemini CLI skills..."
mkdir -p .gemini/skills

for skill in .agents/skills/*/; do
    skill_name=$(basename "$skill")
    target="../../.agents/skills/$skill_name"
    link=".gemini/skills/$skill_name"

    if [ -e "$link" ] || [ -L "$link" ]; then
        echo "  ✓ $skill_name (already exists)"
    else
        ln -s "$target" "$link"
        echo "  ✓ $skill_name (created)"
    fi
done
echo ""

# Create .qwen/skills/ directory with symlinks
if [ ! -d ".qwen" ]; then
    echo "Creating Qwen Code directory..."
    mkdir -p .qwen
fi

echo "Setting up Qwen Code skills..."
mkdir -p .qwen/skills

for skill in .agents/skills/*/; do
    skill_name=$(basename "$skill")
    target="../../.agents/skills/$skill_name"
    link=".qwen/skills/$skill_name"

    if [ -e "$link" ] || [ -L "$link" ]; then
        echo "  ✓ $skill_name (already exists)"
    else
        ln -s "$target" "$link"
        echo "  ✓ $skill_name (created)"
    fi
done
echo ""

echo "✅ Skill symlinks setup complete!"
echo ""
echo "Usage:"
echo "  Claude Code: skill <name>   (e.g., skill agent-coordination)"
echo "  Gemini CLI:  skill <name>   (e.g., skill goap-agent)"
echo "  Qwen Code:   skill <name>   (e.g., skill task-decomposition)"
echo "  OpenCode:    Reads directly from .agents/skills/ (no setup needed)"
