#!/usr/bin/env bash
# Validate skill symlinks and structure
# Run as part of quality gate or CI
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FAILED=0

echo "Validating skill structure..."
echo ""

# Check canonical skills exist
if [ ! -d ".agents/skills" ]; then
    echo "  ✗ .agents/skills/ directory not found"
    exit 1
fi

SKILL_COUNT=$(find .agents/skills -maxdepth 1 -type d | wc -l)
SKILL_COUNT=$((SKILL_COUNT - 1)) # Subtract .agents/skills itself

echo "  Found $SKILL_COUNT canonical skill(s) in .agents/skills/"
echo ""

# Validate each skill structure
for skill_dir in .agents/skills/*/; do
    skill_name=$(basename "$skill_dir")
    echo "Checking $skill_name..."

    # Check SKILL.md exists
    if [ ! -f "$skill_dir/SKILL.md" ]; then
        echo "  ✗ SKILL.md not found"
        FAILED=1
    else
        # Check YAML frontmatter
        if ! head -5 "$skill_dir/SKILL.md" | grep -q "^---$"; then
            echo "  ✗ Missing YAML frontmatter"
            FAILED=1
        else
            # Check for name field
            if ! head -10 "$skill_dir/SKILL.md" | grep -q "^name:"; then
                echo "  ✗ Missing 'name:' in frontmatter"
                FAILED=1
            fi
            # Check for description field
            if ! head -10 "$skill_dir/SKILL.md" | grep -q "^description:"; then
                echo "  ✗ Missing 'description:' in frontmatter"
                FAILED=1
            fi
        fi
        echo "  ✓ SKILL.md structure valid"
    fi
done

echo ""

# Check symlinked skills (Claude, Gemini, Qwen)
for cli_dir in .claude .gemini .qwen; do
    if [ -d "$cli_dir/skills" ]; then
        echo "Checking $cli_dir/skills/ symlinks..."

        for link in "$cli_dir/skills"/*/; do
            if [ -L "$link" ]; then
                # Check if symlink points to valid location
                if [ ! -e "$link" ]; then
                    link_name=$(basename "$link")
                    echo "  ✗ Broken symlink: $link_name"
                    FAILED=1
                fi
            fi
        done
        echo "  ✓ Symlinks valid"
    fi
done

echo ""

if [ $FAILED -ne 0 ]; then
    echo "❌ Skill validation failed"
    exit 2
fi

echo "✅ All skills validated successfully!"
