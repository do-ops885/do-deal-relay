#!/usr/bin/env python3
"""Test script for agent-coordination skill."""

import sys
from pathlib import Path

def test_skill():
    """Run basic validation tests."""
    print("Testing agent-coordination skill...")

    skill_dir = Path(__file__).parent.parent

    # Check required files exist
    required_files = [
        "SKILL.md",
        "PARALLEL.md",
        "SEQUENTIAL.md",
        "SWARM.md",
        "HYBRID.md",
        "ITERATIVE.md"
    ]

    all_exist = True
    for file in required_files:
        file_path = skill_dir / file
        if file_path.exists():
            print(f"✓ {file} exists")
        else:
            print(f"✗ {file} missing")
            all_exist = False

    return 0 if all_exist else 1

if __name__ == "__main__":
    sys.exit(test_skill())
