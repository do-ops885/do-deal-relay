#!/usr/bin/env python3
"""
Test script for pre-commit skill.
"""

import sys
import tempfile
from pathlib import Path
import subprocess


def test_config_generation():
    """Test the init_precommit script."""
    print("Testing config generation...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        
        # Initialize git repo to avoid prompts
        subprocess.run(["git", "init"], cwd=tmp_path, capture_output=True)
        
        # Create a Python file to trigger detection
        (tmp_path / "test.py").write_text("print('hello')\n")
        
        # Run the init script in dry-run mode
        script_path = Path(__file__).parent / "init_precommit.py"
        result = subprocess.run(
            [sys.executable, str(script_path), "--project-path", str(tmp_path), "--dry-run"],
            capture_output=True,
            text=True,
        )
        
        if result.returncode != 0:
            print(f"FAIL: Config generation failed: {result.stderr}")
            return False
        
        if "python" not in result.stdout.lower():
            print("FAIL: Python detection failed")
            return False
        
        print("✓ Config generation works")
        return True


def test_example_configs():
    """Test that example configs are valid YAML."""
    print("Testing example configurations...")
    
    import yaml
    
    examples_dir = Path(__file__).parent.parent / "examples"
    example_files = list(examples_dir.glob("*.yaml"))
    
    if not example_files:
        print("No example YAML files found")
        return True
    
    for example_file in example_files:
        try:
            with open(example_file) as f:
                yaml.safe_load(f)
            print(f"✓ {example_file.name} is valid YAML")
        except Exception as e:
            print(f"FAIL: {example_file.name} is invalid: {e}")
            return False
    
    return True


def test_skill_md_structure():
    """Test that SKILL.md has proper structure."""
    print("Testing SKILL.md structure...")
    
    skill_md = Path(__file__).parent.parent / "SKILL.md"
    
    if not skill_md.exists():
        print("FAIL: SKILL.md not found")
        return False
    
    content = skill_md.read_text()
    
    # Check for required sections
    required_sections = ["---", "name:", "version:", "## Quick Start", "## Commands"]
    for section in required_sections:
        if section not in content:
            print(f"FAIL: Missing required section: {section}")
            return False
    
    # Check line count
    line_count = len(content.splitlines())
    if line_count > 250:
        print(f"FAIL: SKILL.md exceeds 250 lines ({line_count})")
        return False
    
    print(f"✓ SKILL.md structure is valid ({line_count} lines)")
    return True


def test_skill():
    """Run all skill tests."""
    print("Testing pre-commit skill...\n")
    
    tests = [
        test_skill_md_structure,
        test_example_configs,
        test_config_generation,
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"FAIL: Test raised exception: {e}")
            results.append(False)
        print()
    
    passed = sum(results)
    total = len(results)
    
    print(f"Results: {passed}/{total} tests passed")
    
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(test_skill())
