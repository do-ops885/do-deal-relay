#!/usr/bin/env bash
# scripts/setup-skills.sh — Create symlinks for AI CLI tools
# Canonical skills in .agents/skills/ symlinked to .<tool>/skills/
# Supports: Claude Code (.claude/), Gemini CLI (.gemini/), Qwen Code (.qwen/)
# OpenCode reads directly from .agents/skills/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SKILLS_DIR="${ROOT_DIR}/.agents/skills"

if [ ! -d "$SKILLS_DIR" ]; then
    echo "Error: .agents/skills/ directory not found at $SKILLS_DIR"
    echo "Run: mkdir -p .agents/skills/"
    exit 1
fi

echo "Setting up skill symlinks..."

# Claude Code
CLAUDE_SKILLS="${ROOT_DIR}/.claude/skills"
mkdir -p "$CLAUDE_SKILLS"
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    target="${CLAUDE_SKILLS}/${skill_name}"
    if [ -L "$target" ]; then
        rm "$target"
    fi
    ln -sf "../../.agents/skills/${skill_name}" "$target"
    echo "  .claude/skills/${skill_name}"
done

# Gemini CLI
GEMINI_SKILLS="${ROOT_DIR}/.gemini/skills"
mkdir -p "$GEMINI_SKILLS"
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    target="${GEMINI_SKILLS}/${skill_name}"
    if [ -L "$target" ]; then
        rm "$target"
    fi
    ln -sf "../../.agents/skills/${skill_name}" "$target"
    echo "  .gemini/skills/${skill_name}"
done

# Qwen Code
QWEN_SKILLS="${ROOT_DIR}/.qwen/skills"
mkdir -p "$QWEN_SKILLS"
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    target="${QWEN_SKILLS}/${skill_name}"
    if [ -L "$target" ]; then
        rm "$target"
    fi
    ln -sf "../../.agents/skills/${skill_name}" "$target"
    echo "  .qwen/skills/${skill_name}"
done

echo ""
echo "Skills setup complete."
echo "Canonical skills: .agents/skills/"
echo "Symlinks created for: Claude Code, Gemini CLI, Qwen Code"
echo "OpenCode reads directly from .agents/skills/"
