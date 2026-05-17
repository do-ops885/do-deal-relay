#!/usr/bin/env python3
"""
Eval Generator for jules-usage Skill

Generates evals.json by reading the skill's own content:
- SKILL.md sections, workflows, CLI commands, edge cases, red flags
- Scripts in scripts/ directory
- References in references/ directory

This ensures evals stay in sync with the skill — never manually edit evals.json.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SKILL_MD = SKILL_DIR / "SKILL.md"
SCRIPTS_DIR = SKILL_DIR / "scripts"
REFERENCES_DIR = SKILL_DIR / "references"
EVALS_DIR = SKILL_DIR / "evals"
EVALS_JSON = EVALS_DIR / "evals.json"
RESULTS_JSON = EVALS_DIR / "results.json"


def extract_sections(content: str) -> list[dict]:
    """Extract ##-level sections from SKILL.md with their content."""
    sections = []
    lines = content.splitlines()
    current_section = None
    current_lines = []

    for line in lines:
        if line.startswith("## ") and not line.startswith("### "):
            if current_section:
                sections.append({
                    "name": current_section,
                    "content": "\n".join(current_lines).strip(),
                })
            current_section = line.strip("# ").strip()
            current_lines = []
        elif current_section is not None:
            current_lines.append(line)

    if current_section:
        sections.append({
            "name": current_section,
            "content": "\n".join(current_lines).strip(),
        })
    return sections


def extract_cli_commands(content: str) -> list[str]:
    """Extract CLI commands from code blocks and inline references."""
    commands = set()

    # Extract commands from code blocks
    code_blocks = re.findall(r"```(?:bash)?\n(.*?)```", content, re.DOTALL)
    for block in code_blocks:
        for line in block.splitlines():
            line = line.strip()
            # Capture jules, gh, curl, npm commands
            if any(line.startswith(cmd) for cmd in ["jules", "gh", "curl", "npm", "command -v"]):
                # Normalize: remove arguments for a clean command name
                cmd_name = line.split()[0] if line.split() else line
                commands.add(cmd_name)
                # Also capture the full command pattern
                if line.startswith("jules"):
                    parts = line.split()
                    if len(parts) >= 2:
                        commands.add(f"jules {parts[1]}")

    # Extract inline commands
    inline_cmds = re.findall(r"`(jules\s+\w+)`", content)
    for cmd in inline_cmds:
        commands.add(cmd)

    return sorted(commands)


def extract_edge_cases(content: str) -> list[str]:
    """Extract edge cases from the Edge cases section."""
    edge_cases = []
    in_edge_section = False

    for line in content.splitlines():
        if line.strip().startswith("## Edge cases"):
            in_edge_section = True
            continue
        if in_edge_section:
            if line.startswith("## "):
                break
            stripped = line.strip()
            if stripped.startswith("- ") or stripped.startswith("* "):
                edge_cases.append(stripped.lstrip("-* ").strip())
    return edge_cases


def extract_red_flags(content: str) -> list[str]:
    """Extract red flags from the Red Flags section."""
    red_flags = []
    in_red_section = False

    for line in content.splitlines():
        if line.strip().startswith("## Red Flags"):
            in_red_section = True
            continue
        if in_red_section:
            if line.startswith("## "):
                break
            stripped = line.strip()
            if stripped.startswith("- [ ]"):
                red_flags.append(stripped.lstrip("- [ ]").strip())
    return red_flags


def extract_workflows(content: str) -> list[dict]:
    """Extract documented workflows from SKILL.md."""
    workflows = []

    # Check for specific workflow patterns
    workflow_patterns = [
        {
            "name": "CLI Installation Check",
            "id": "jules-install-check",
            "keywords": ["command -v jules", "command -v gh", "Check whether"],
            "assertions": [
                "Checks for jules using command -v or equivalent",
                "Reports jules CLI version or installation status",
                "Lists available jules commands",
                "Does not depend on non-existent commands like 'check' or 'status'",
                "Provides fallback guidance if jules is not available",
            ],
        },
        {
            "name": "CLI Installation Fallback",
            "id": "jules-install-fallback",
            "keywords": ["npm install -g @jules/cli", "installation fails"],
            "assertions": [
                "Attempts npm install -g @jules/cli",
                "Checks for npm/corepack availability before attempting install",
                "Does not proceed without verification",
                "Reports exact install failure output if it fails",
                "Provides REST API fallback option when CLI unavailable",
            ],
        },
        {
            "name": "Repository Verification",
            "id": "jules-repo-verification",
            "keywords": ["gh auth status", "gh repo view", "nameWithOwner"],
            "assertions": [
                "Uses gh to confirm repo context (gh auth status, gh repo view)",
                "Verifies the repo name with gh repo view --json nameWithOwner",
                "Uses jules new to assign a session",
                "Or uses jules remote new to create a remote session",
                "Reports success or failure with exact command output",
            ],
        },
        {
            "name": "GitHub Issue Labeling",
            "id": "jules-github-issue-labeling",
            "keywords": ["label", "gh issue edit", "gh issue create"],
            "assertions": [
                "Verifies Jules is available before adding the label",
                "Uses gh issue create or gh issue edit to add label",
                "Creates issue with descriptive title and body if needed",
                "Does not add label if Jules task capacity is full",
                "Uses the available 'jules' label on the repository",
            ],
        },
        {
            "name": "PR Comment Guidance",
            "id": "jules-pr-guidance",
            "keywords": ["@jules address and analyze feedback"],
            "assertions": [
                "Uses the exact Jules trigger phrase: @jules address and analyze feedback for impact the codebase, if has impact change, git commit, git push all changes back to the branch",
                "Includes sufficient context about the PR and existing feedback",
                "Does not add jules label without prior capacity check",
                "Provides clear expected outcome for the Jules task",
                "Mentions the specific feedback points to address",
            ],
        },
        {
            "name": "Task Capacity Check",
            "id": "jules-task-capacity",
            "keywords": ["jules remote list", "3 tasks", "capacity", "active sessions"],
            "assertions": [
                "Attempts jules remote list or equivalent capacity check command",
                "Does not proceed if 3 tasks are already running",
                "If jules remote list unavailable, reports alternative method",
                "If task creation fails after labeling, removes and re-adds label only after capacity is free",
                "Reports clear guidance on capacity limits",
            ],
        },
        {
            "name": "REST API Fallback",
            "id": "jules-api-fallback",
            "keywords": ["JULES_API_KEY", "x-goog-api-key", "jules.googleapis.com/v1alpha"],
            "assertions": [
                "Checks for JULES_API_KEY environment variable before proceeding",
                "Uses curl with x-goog-api-key header (not Authorization: Bearer)",
                "Uses correct base URL: https://jules.googleapis.com/v1alpha",
                "Makes request to correct endpoint (e.g., /sessions, /sources)",
                "Reports exact API response or error",
            ],
        },
    ]

    missing_keywords = {}  # track which keywords are missing for warnings
    for pattern in workflow_patterns:
        missing = [kw for kw in pattern["keywords"] if kw.lower() not in content.lower()]
        if not missing:
            workflows.append({
                "id": pattern["id"],
                "name": pattern["name"],
                "present": True,
                "assertions": pattern["assertions"],
            })
        else:
            missing_keywords[pattern["id"]] = {
                "name": pattern["name"],
                "missing": missing,
            }

    # Warn about workflow evals that are no longer generated
    if missing_keywords:
        print(f"\n⚠️  Workflow eval drift detected — {len(missing_keywords)} eval(s) no longer match skill content:")
        for eid, info in missing_keywords.items():
            print(f"   - {info['name']} ({eid})")
            for kw in info["missing"]:
                print(f"     ↳ missing keyword: '{kw}'")
            print(f"     ↳ Action: update keyword pattern in extract_workflows() or add missing content to SKILL.md")

    return workflows


def discover_scripts() -> list[Path]:
    """Discover shell scripts in scripts/ directory."""
    if not SCRIPTS_DIR.exists():
        return []
    return sorted(SCRIPTS_DIR.glob("*.sh")) + sorted(SCRIPTS_DIR.glob("*.py"))


def validate_script_syntax(script_path: Path) -> bool:
    """Check if a shell script has valid bash syntax."""
    if script_path.suffix == ".sh":
        try:
            result = subprocess.run(
                ["bash", "-n", str(script_path)],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False
    return True


def script_has_api_key_check(content: str) -> bool:
    """Check if script checks for JULES_API_KEY."""
    return "JULES_API_KEY" in content


def script_has_error_handling(content: str) -> bool:
    """Check if script has set -euo pipefail."""
    return "set -euo pipefail" in content or "set -e" in content


def generate_script_evals() -> list[dict]:
    """Generate eval cases from discovered scripts."""
    evals = []
    scripts = discover_scripts()

    for script in scripts:
        if script.suffix != ".sh":
            continue
        content = script.read_text()
        script_name = script.name
        rel_path = str(script.relative_to(SKILL_DIR))

        # Determine what kind of script this is
        if "api_request" in script_name or "api" in script_name.lower():
            evals.append({
                "id": f"jules-script-{script.stem}",
                "name": f"Script: {script_name}",
                "prompt": f"Run the {script_name} script to validate the repository",
                "expected_output": "Successful execution of the API request script",
                "files": [rel_path],
                "assertions": [
                    "Script executes without shell errors",
                    f"Script validates required arguments (endpoint and payload)" if "$1" in content or "$0" in content else "Script handles arguments properly",
                    "Script checks for JULES_API_KEY environment variable" if script_has_api_key_check(content) else "Script is self-contained",
                    "Reports clear error messages when arguments or prerequisites are missing",
                    "Exits with appropriate error codes for failures",
                    "Has valid shell syntax (bash -n)" if validate_script_syntax(script) else "Needs syntax fixes",
                ],
            })
        elif "start_session" in script_name or "session" in script_name.lower():
            evals.append({
                "id": f"jules-script-{script.stem}",
                "name": f"Script: {script_name}",
                "prompt": f"Run the {script_name} script to start a Jules session",
                "expected_output": "Jules session started with CLI or API fallback",
                "files": [rel_path],
                "assertions": [
                    "Script executes without shell errors",
                    "Has CLI → API fallback logic (checks for jules CLI first)" if "command -v jules" in content else "Script handles CLI availability",
                    "Uses gh for repo metadata" if "gh" in content else "Script handles repo context",
                    "Reports clear error messages when prerequisites are missing",
                    "Exits with appropriate error codes for failures",
                    "Has valid shell syntax (bash -n)" if validate_script_syntax(script) else "Needs syntax fixes",
                ],
            })

    return evals


def generate_edge_case_evals(content: str) -> list[dict]:
    """Generate eval cases from documented edge cases and red flags."""
    evals = []
    edge_cases = extract_edge_cases(content)
    red_flags = extract_red_flags(content)

    # Edge case: no GitHub repo
    has_no_repo_edge = any("not a git repository" in e.lower() or "github metadata" in e.lower() for e in edge_cases)
    if has_no_repo_edge:
        evals.append({
            "id": "jules-edge-case-no-repo",
            "name": "Edge Case: Non-GitHub Repository",
            "prompt": "The current directory is not a GitHub repository or gh metadata is unavailable - attempt to use Jules anyway",
            "expected_output": "Graceful failure with clear error message",
            "files": [],
            "assertions": [
                "Detects that gh is not available or repo metadata is missing",
                "Does not attempt GitHub issue/PR automation",
                "Reports that GitHub context is required",
                "Suggests alternative validation options",
                "Exits with non-zero error code",
            ],
        })

    # Edge case: no API key
    if "JULES_API_KEY" in content:
        evals.append({
            "id": "jules-edge-case-no-api-key",
            "name": "Edge Case: API Key Missing",
            "prompt": "Jules CLI is not available and JULES_API_KEY is not set - attempt repo validation",
            "expected_output": "Clear report that neither CLI nor API access is available",
            "files": [],
            "assertions": [
                "Checks for JULES_API_KEY environment variable",
                "Reports that JULES_API_KEY is required for API fallback",
                "Does not proceed with validation without credentials",
                "Provides guidance on setting up JULES_API_KEY",
                "Exits with appropriate non-zero error code",
            ],
        })

    # Edge case: install failure or CLI unavailable
    install_failure_edges = [e for e in edge_cases if "install" in e.lower() or "unavailable" in e.lower()]
    if install_failure_edges or any("report the failure" in r for r in red_flags):
        evals.append({
            "id": "jules-edge-case-install-failure",
            "name": "Edge Case: CLI Install Failure",
            "prompt": "Jules CLI install fails or is unavailable in the runtime environment",
            "expected_output": "Clear report of the failure with alternative options",
            "files": [],
            "assertions": [
                "Detects that jules CLI is not available",
                "Reports the exact installation failure output",
                "Suggests REST API fallback option",
                "Checks for JULES_API_KEY before suggesting API fallback",
                "Exits with appropriate non-zero error code if no fallback available",
            ],
        })

    return evals


def generate_reference_evals() -> list[dict]:
    """Generate eval cases from reference documents."""
    evals = []

    if REFERENCES_DIR.exists():
        for ref_file in sorted(REFERENCES_DIR.glob("*.md")):
            content = ref_file.read_text()
            ref_name = ref_file.stem
            rel_path = str(ref_file.relative_to(SKILL_DIR))

            evals.append({
                "id": f"jules-reference-{ref_name}",
                "name": f"Reference: {ref_name}.md",
                "prompt": f"Use the {ref_name}.md reference to look up Jules CLI commands or API details",
                "expected_output": f"Accurate command or API reference from {ref_name}.md",
                "files": [rel_path],
                "assertions": [
                    "Reference document exists and is accessible",
                    "Contains accurate jules CLI commands (no deprecated 'check' or 'status' commands)",
                    "Contains accurate API details (base URL, auth header, endpoints)",
                    "Includes error handling guidance",
                    "References are consistent with SKILL.md",
                ],
            })

    return evals


def generate_evals_json(content: str) -> dict:
    """Generate the complete evals.json from skill content."""
    meta = {"skill_name": "jules-usage", "version": "1.0.0"}

    # Extract description from frontmatter
    desc_match = re.search(r"description:\s*(.+)", content)
    meta["description"] = desc_match.group(1).strip() if desc_match else ""

    evals = []

    # 1. Workflow evals from SKILL.md sections
    workflows = extract_workflows(content)
    for wf in workflows:
        prompt_map = {
            "jules-install-check": "Check if Jules CLI is installed and usable in this environment",
            "jules-install-fallback": "Jules CLI is not available - install it and set up the environment for repo validation",
            "jules-repo-verification": "Verify the current repository state using Jules CLI for a long-running validation task",
            "jules-github-issue-labeling": "Label a GitHub issue with 'jules' for a long-running e2e validation task",
            "jules-pr-guidance": "A pull request has feedback that needs Jules to address. Leave instructions for Jules to fix the PR.",
            "jules-task-capacity": "Check if Jules has available task capacity before assigning a new task",
            "jules-api-fallback": "Jules CLI is not available, use the REST API fallback for repo validation",
        }
        expected_map = {
            "jules-install-check": "Report of Jules CLI availability with version and available commands",
            "jules-install-fallback": "Installation attempt via npm with clear fallback path",
            "jules-repo-verification": "Repo validation initiated via jules new or equivalent",
            "jules-github-issue-labeling": "Issue labeled with jules after confirming capacity",
            "jules-pr-guidance": "PR comment with exact Jules instruction for feedback-driven fixes",
            "jules-task-capacity": "Task capacity report or fallback guidance",
            "jules-api-fallback": "REST API call to Jules with authentication",
        }
        evals.append({
            "id": wf["id"],
            "name": wf["name"],
            "prompt": prompt_map.get(wf["id"], f"Execute the {wf['name']} workflow"),
            "expected_output": expected_map.get(wf["id"], "Successful workflow execution"),
            "files": ["SKILL.md"],
            "assertions": wf["assertions"],
        })

    # 2. Script evals
    script_evals = generate_script_evals()
    evals.extend(script_evals)

    # 3. Edge case evals
    edge_evals = generate_edge_case_evals(content)
    evals.extend(edge_evals)

    # 4. Reference evals
    ref_evals = generate_reference_evals()
    evals.extend(ref_evals)

    return {
        "skill_name": meta["skill_name"],
        "version": meta["version"],
        "description": meta["description"],
        "generated_by": "scripts/generate_evals.py",
        "evals": evals,
    }


def main():
    if not SKILL_MD.exists():
        print(f"❌ SKILL.md not found at {SKILL_MD}")
        sys.exit(1)

    content = SKILL_MD.read_text()
    generated = generate_evals_json(content)
    eval_count = len(generated["evals"])

    EVALS_DIR.mkdir(parents=True, exist_ok=True)
    with open(EVALS_JSON, "w") as f:
        json.dump(generated, f, indent=2)

    # Format with Prettier if available to ensure consistency with CI
    try:
        subprocess.run(
            ["npx", "prettier", "--write", str(EVALS_JSON)],
            capture_output=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    print(f"✅ Generated {eval_count} eval cases from skill content")
    print(f"   Source: {SKILL_MD}")
    print(f"   Output: {EVALS_JSON}")

    # Summary
    ids = [e["id"] for e in generated["evals"]]
    print(f"\n📋 Generated eval IDs:")
    for eid in ids:
        print(f"   - {eid}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
