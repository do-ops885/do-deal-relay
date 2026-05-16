#!/usr/bin/env python3
"""
Test Suite for jules-usage Skill

Tests the jules-usage skill's shell scripts and documented workflows:
- jules_start_session.sh - Start a Jules session via CLI or API fallback
- jules_api_request.sh - Generic Jules API request helper
- Skill instructions and reference accuracy
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = SKILL_DIR / "scripts"
SKILL_MD = SKILL_DIR / "SKILL.md"
COMMANDS_MD = SKILL_DIR / "references" / "commands.md"
EVALS_JSON = SKILL_DIR / "evals" / "evals.json"


def check_result(name: str, passed: bool, detail: str = "") -> dict:
    return {"name": name, "passed": passed, "detail": detail}


def test_skill_md_exists():
    """Check that SKILL.md exists and has proper structure."""
    results = []
    exists = SKILL_MD.exists()
    results.append(check_result(
        "SKILL.md exists",
        exists,
        f"SKILL.md found at {SKILL_MD}" if exists else f"SKILL.md not found at {SKILL_MD}"
    ))

    if exists:
        content = SKILL_MD.read_text()
        has_frontmatter = content.startswith("---")
        results.append(check_result(
            "Has YAML frontmatter",
            has_frontmatter,
            "Frontmatter starts with ---" if has_frontmatter else "Missing --- frontmatter delimiter"
        ))

        # Check for required sections
        has_quick_start = "## Quick Start" not in content  # This skill uses different section headers
        # Check for key section headers instead of Overview/Quick Start
        has_sections = all(s in content for s in [
            "## Installation / verification",
            "## Repository setup and verification",
            "## Repository check flow",
            "## GitHub issue and PR behavior",
            "## Edge cases",
        ])
        results.append(check_result(
            "Has core sections",
            has_sections,
            "All core sections found" if has_sections else "Missing some core sections"
        ))

        line_count = len(content.splitlines())
        under_limit = line_count <= 250
        results.append(check_result(
            f"Under 250 lines ({line_count})",
            under_limit,
            f"Line count: {line_count}"
        ))

        # Check that commands reflect actual jules CLI (not check/status)
        has_correct_commands = "jules check repo" not in content and "jules status" not in content
        has_actual_commands = "jules new" in content or "jules remote" in content
        results.append(check_result(
            "Uses correct jules CLI commands",
            has_correct_commands and has_actual_commands,
            f"Correct commands found: {has_actual_commands}, deprecated commands removed: {has_correct_commands}"
        ))

    return results


def test_commands_ref():
    """Check that commands.md exists and has accurate commands."""
    results = []
    exists = COMMANDS_MD.exists()
    results.append(check_result(
        "commands.md exists",
        exists,
        f"Found at {COMMANDS_MD}" if exists else f"Not found at {COMMANDS_MD}"
    ))

    if exists:
        content = COMMANDS_MD.read_text()
        has_no_deprecated = "jules check repo" not in content and "jules status" not in content
        has_actual = "jules new" in content or "jules remote" in content
        results.append(check_result(
            "Accurate jules commands in reference",
            has_no_deprecated and has_actual,
            f"Correct commands: {has_actual}, no deprecated: {has_no_deprecated}"
        ))
    return results


def test_evals_json():
    """Check that evals.json exists and has valid structure."""
    results = []
    exists = EVALS_JSON.exists()
    results.append(check_result(
        "evals.json exists",
        exists,
        f"Found at {EVALS_JSON}" if exists else f"Not found at {EVALS_JSON}"
    ))

    if exists:
        try:
            data = json.loads(EVALS_JSON.read_text())
            has_evals = "evals" in data
            results.append(check_result(
                "Has 'evals' key",
                has_evals,
                f"evals key present: {has_evals}"
            ))

            if has_evals:
                count = len(data["evals"])
                results.append(check_result(
                    f"Has {count} eval cases",
                    count >= 8,
                    f"Found {count} eval cases (minimum 8 recommended)"
                ))

                # Check each eval has required fields
                all_valid = True
                for i, ev in enumerate(data["evals"]):
                    required = ["id", "prompt", "expected_output", "assertions"]
                    missing = [r for r in required if r not in ev]
                    if missing:
                        all_valid = False
                        results.append(check_result(
                            f"Eval {i} ({ev.get('id', 'unknown')}) has required fields",
                            False,
                            f"Missing fields: {missing}"
                        ))

                if all_valid:
                    results.append(check_result(
                        "All eval cases have required fields",
                        True,
                        "id, prompt, expected_output, and assertions present in all cases"
                    ))

        except json.JSONDecodeError as e:
            results.append(check_result(
                "Valid JSON in evals.json",
                False,
                f"JSON parse error: {e}"
            ))

    return results


def test_jules_api_request_script():
    """Test jules_api_request.sh script structure."""
    results = []
    script_path = SCRIPTS_DIR / "jules_api_request.sh"
    exists = script_path.exists()
    results.append(check_result(
        "jules_api_request.sh exists",
        exists,
        f"Found at {script_path}" if exists else f"Not found at {script_path}"
    ))

    if exists:
        content = script_path.read_text()
        has_shebangs = content.startswith("#!/usr/bin/env bash") or content.startswith("#!/bin/bash")
        results.append(check_result(
            "Has valid shebang",
            has_shebangs,
            "#!/usr/bin/env bash found" if has_shebangs else "Missing or invalid shebang"
        ))

        has_error_handling = "set -euo pipefail" in content
        results.append(check_result(
            "Has error handling (set -euo pipefail)",
            has_error_handling,
            "Error handling enabled" if has_error_handling else "Missing strict error handling"
        ))

        has_jules_api_key_check = "JULES_API_KEY" in content
        results.append(check_result(
            "Checks for JULES_API_KEY",
            has_jules_api_key_check,
            "API key validation present" if has_jules_api_key_check else "Missing API key check"
        ))

        has_usage_check = "Usage:" in content or "$0" in content
        results.append(check_result(
            "Has usage instructions",
            has_usage_check,
            "Usage instructions found" if has_usage_check else "Missing usage instructions"
        ))

    return results


def test_jules_start_session_script():
    """Test jules_start_session.sh script structure."""
    results = []
    script_path = SCRIPTS_DIR / "jules_start_session.sh"
    exists = script_path.exists()
    results.append(check_result(
        "jules_start_session.sh exists",
        exists,
        f"Found at {script_path}" if exists else f"Not found at {script_path}"
    ))

    if exists:
        content = script_path.read_text()
        has_shebang = "#!/usr/bin/env bash" in content or "#!/bin/bash" in content
        results.append(check_result(
            "Has valid shebang",
            has_shebang,
            "Shebang found" if has_shebang else "Missing shebang"
        ))

        has_error_handling = "set -euo pipefail" in content
        results.append(check_result(
            "Has error handling",
            has_error_handling,
            "Error handling enabled" if has_error_handling else "Missing strict error handling"
        ))

        # Check it uses actual jules commands
        has_correct_jules_cmd = "jules check repo" not in content
        results.append(check_result(
            "Uses correct jules commands (no deprecated 'check repo')",
            has_correct_jules_cmd,
            "No deprecated commands" if has_correct_jules_cmd else "Contains deprecated 'jules check repo' reference"
        ))

        # Check it has fallback logic
        has_cli_check = "command -v jules" in content
        has_api_fallback = "JULES_API_KEY" in content
        has_fallback = has_cli_check and has_api_fallback
        results.append(check_result(
            "Has CLI → API fallback logic",
            has_fallback,
            f"CLI check: {has_cli_check}, API fallback: {has_api_fallback}"
        ))

        # Check gh usage
        has_gh_repo = "gh repo view" in content
        results.append(check_result(
            "Uses gh for repo metadata",
            has_gh_repo,
            "gh repo view found" if has_gh_repo else "Missing gh repo view"
        ))

    return results


def test_script_syntax():
    """Test that shell scripts have valid syntax."""
    results = []
    for script_name in ["jules_start_session.sh", "jules_api_request.sh"]:
        script_path = SCRIPTS_DIR / script_name
        if script_path.exists():
            try:
                # Check bash syntax using bash -n
                result = subprocess.run(
                    ["bash", "-n", str(script_path)],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                valid_syntax = result.returncode == 0
                results.append(check_result(
                    f"{script_name} has valid shell syntax",
                    valid_syntax,
                    "Syntax OK" if valid_syntax else f"Syntax error: {result.stderr[:200]}"
                ))
            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                results.append(check_result(
                    f"{script_name} syntax check",
                    False,
                    f"Check error: {e}"
                ))
    return results


def test_evals_generated_from_skill():
    """Verify evals.json is generated by scripts/generate_evals.py from skill content."""
    results = []
    gen_script = SCRIPTS_DIR / "generate_evals.py"
    exists = gen_script.exists()
    results.append(check_result(
        "generate_evals.py exists",
        exists,
        f"Found at {gen_script}" if exists else f"Not found at {gen_script}"
    ))

    if exists:
        # Run the generator
        try:
            gen_result = subprocess.run(
                [sys.executable, str(gen_script)],
                capture_output=True,
                text=True,
                timeout=30
            )
            gen_ok = gen_result.returncode == 0
            results.append(check_result(
                "generate_evals.py runs successfully",
                gen_ok,
                "Exit code 0" if gen_ok else f"Exit code {gen_result.returncode}: {gen_result.stderr[:200]}"
            ))
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            results.append(check_result(
                "generate_evals.py runs successfully",
                False,
                f"Execution error: {e}"
            ))

        # Verify generated evals.json
        if EVALS_JSON.exists():
            try:
                data = json.loads(EVALS_JSON.read_text())

                # Check generated_by field
                has_generated_by = "generated_by" in data
                results.append(check_result(
                    "evals.json has 'generated_by' field",
                    has_generated_by,
                    f"generated_by: {data.get('generated_by', 'missing')}" if has_generated_by else "Missing generated_by field"
                ))

                # Check evals array
                if "evals" in data:
                    eval_count = len(data["evals"])
                    results.append(check_result(
                        f"Generated {eval_count} eval cases",
                        eval_count >= 8,
                        f"Found {eval_count} eval cases (minimum 8)"
                    ))

                    # Check all required fields
                    all_valid = True
                    for i, ev in enumerate(data["evals"]):
                        required = ["id", "name", "prompt", "expected_output", "assertions"]
                        missing = [r for r in required if r not in ev]
                        if missing:
                            all_valid = False
                            results.append(check_result(
                                f"Eval {i} ({ev.get('id', 'unknown')}) has required fields",
                                False,
                                f"Missing fields: {missing}"
                            ))

                    if all_valid:
                        results.append(check_result(
                            "All eval cases have required fields",
                            True,
                            "id, name, prompt, expected_output, assertions in all cases"
                        ))

                    # Check that assertions are specific (not subjective)
                    all_specific = all(
                        len(ev.get("assertions", [])) >= 3
                        for ev in data["evals"]
                    )
                    results.append(check_result(
                        "All eval cases have >= 3 assertions",
                        all_specific,
                        "All evals have meaningful assertion counts" if all_specific else "Some evals have < 3 assertions"
                    ))

            except json.JSONDecodeError as e:
                results.append(check_result(
                    "Generated evals.json is valid JSON",
                    False,
                    f"JSON parse error: {e}"
                ))

    return results


def test_skill_workflow_documentation():
    """Verify the skill documents all required workflows."""
    results = []
    if SKILL_MD.exists():
        content = SKILL_MD.read_text()

        workflows = {
            "gh installation check": "command -v gh" in content,
            "jules installation check": "command -v jules" in content,
            "npm install fallback": "npm install -g @jules/cli" in content,
            "Repo setup verification": "gh auth status" in content or "gh repo view" in content,
            "Jules session via jules new": "jules new" in content,
            "Remote session management": "jules remote" in content,
            "Teleport changes": "jules teleport" in content,
            "REST API fallback": "jules.googleapis.com/v1alpha" in content,
            "Issue labeling": "label" in content and "jules" in content.lower(),
            "PR comment guidance": "@jules address and analyze feedback" in content,
            "Edge case: non-GitHub repo": "If the repository is not a git repository" in content or "repo metadata is unavailable" in content,
            "Edge case: install failure": "installation fails" in content or "stop and report the failure" in content,
            "Red flags section": "## Red Flags" in content,
            "Rationalizations section": "## Rationalizations" in content,
        }

        for workflow, present in workflows.items():
            results.append(check_result(
                f"Workflow documented: {workflow}",
                present,
                "Found in SKILL.md" if present else "Not found in SKILL.md"
            ))

    return results


def test_shell_scripts_runnable():
    """Test that shell scripts are executable and can start (but won't run fully without env)."""
    results = []
    for script_name in ["jules_start_session.sh", "jules_api_request.sh"]:
        script_path = SCRIPTS_DIR / script_name
        if script_path.exists():
            is_executable = os.access(script_path, os.X_OK)
            results.append(check_result(
                f"{script_name} is executable",
                is_executable,
                "Executable" if is_executable else "Not executable (run chmod +x)"
            ))

    return results


def main():
    all_tests = [
        ("SKILL.md structure", test_skill_md_exists),
        ("commands.md reference", test_commands_ref),
        ("Eval generation from skill", test_evals_generated_from_skill),
        ("evals.json structure", test_evals_json),
        ("jules_api_request.sh structure", test_jules_api_request_script),
        ("jules_start_session.sh structure", test_jules_start_session_script),
        ("Script syntax", test_script_syntax),
        ("Workflow documentation", test_skill_workflow_documentation),
        ("Script executability", test_shell_scripts_runnable),
    ]

    total_passed = 0
    total_failed = 0
    all_results = []

    print("=" * 70)
    print("  JULES-USAGE SKILL TEST SUITE")
    print("=" * 70)

    for category, test_fn in all_tests:
        print(f"\n📁 {category}")
        print("-" * 50)
        try:
            results = test_fn()
            for r in results:
                status = "✅ PASS" if r["passed"] else "❌ FAIL"
                if r["passed"]:
                    total_passed += 1
                else:
                    total_failed += 1
                print(f"  {status} | {r['name']}")
                if not r["passed"] and r["detail"]:
                    print(f"          ↳ {r['detail']}")
                all_results.append(r)
        except Exception as e:
            total_failed += 1
            print(f"  ❌ FAIL | {category} — error: {e}")
            all_results.append(check_result(category, False, str(e)))

    print("\n" + "=" * 70)
    print(f"  RESULTS: {total_passed} passed, {total_failed} failed")
    print("=" * 70)

    # Save results
    result_data = {
        "timestamp": __import__("datetime").datetime.now().isoformat(),
        "total": total_passed + total_failed,
        "passed": total_passed,
        "failed": total_failed,
        "results": all_results,
    }

    results_path = SKILL_DIR / "evals" / "test_results.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    with open(results_path, "w") as f:
        json.dump(result_data, f, indent=2)

    print(f"\n💾 Results saved to: {results_path}")

    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
