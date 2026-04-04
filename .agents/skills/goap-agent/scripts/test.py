#!/usr/bin/env python3
"""Test script for goap-agent skill."""

import sys
from pathlib import Path

def test_skill():
    """Run basic validation tests."""
    print("Testing goap-agent skill...")

    skill_dir = Path(__file__).parent.parent

    # Check SKILL.md exists
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        print("✗ SKILL.md not found")
        return 1

    print("✓ SKILL.md exists")

    # Check frontmatter
    content = skill_md.read_text()
    if content.startswith('---'):
        print("✓ Has YAML frontmatter")
    else:
        print("✗ Missing frontmatter")
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(test_skill())
