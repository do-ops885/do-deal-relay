#!/usr/bin/env python3
"""
Skill Evaluation Framework
Comprehensive testing and validation for all agent skills.
"""

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional


class SkillEvaluator:
    """Evaluate agent skills for correctness and completeness."""

    def __init__(self, skills_dir: Optional[Path] = None):
        self.skills_dir = skills_dir or Path(".agents/skills")
        self.results: Dict[str, dict] = {}

    def discover_skills(self) -> List[Path]:
        """Discover all skills in the skills directory."""
        skills = []
        for item in self.skills_dir.iterdir():
            if item.is_dir() and not item.name.startswith('.') and item.name != 'evals':
                skill_md = item / "SKILL.md"
                if skill_md.exists():
                    skills.append(item)
        return sorted(skills)

    def evaluate_skill(self, skill_path: Path) -> dict:
        """Evaluate a single skill."""
        skill_name = skill_path.name
        print(f"\n🔍 Evaluating skill: {skill_name}")

        results = {
            'name': skill_name,
            'status': 'pending',
            'checks': {},
            'errors': [],
            'warnings': []
        }

        # Check 1: SKILL.md exists and has proper structure
        skill_md = skill_path / "SKILL.md"
        if skill_md.exists():
            content = skill_md.read_text()
            results['checks']['skill_md_exists'] = True

            # Check frontmatter
            if content.startswith('---'):
                results['checks']['has_frontmatter'] = True
            else:
                results['checks']['has_frontmatter'] = False
                results['errors'].append("Missing YAML frontmatter")

            # Check required sections
            required_sections = ['## Overview', '## Quick Start']
            for section in required_sections:
                if section in content:
                    results['checks'][f'has_{section.lower().replace(" ", "_")}'] = True
                else:
                    results['checks'][f'has_{section.lower().replace(" ", "_")}'] = False
                    results['warnings'].append(f"Missing section: {section}")

            # Check line count
            line_count = len(content.splitlines())
            results['checks']['line_count'] = line_count
            if line_count > 250:
                results['errors'].append(f"SKILL.md exceeds 250 lines ({line_count})")
        else:
            results['checks']['skill_md_exists'] = False
            results['errors'].append("SKILL.md not found")

        # Check 2: Examples exist
        examples_dir = skill_path / "examples"
        if examples_dir.exists():
            examples = list(examples_dir.glob("*"))
            results['checks']['examples_count'] = len(examples)
            if len(examples) == 0:
                results['warnings'].append("No examples provided")
        else:
            results['checks']['examples_count'] = 0
            results['warnings'].append("No examples directory")

        # Check 3: References exist
        refs_dir = skill_path / "references"
        if refs_dir.exists():
            results['checks']['has_references'] = True
        else:
            results['checks']['has_references'] = False
            results['warnings'].append("No references directory")

        # Check 4: Scripts exist
        scripts_dir = skill_path / "scripts"
        if scripts_dir.exists():
            results['checks']['has_scripts'] = True
            # Check for test script
            test_script = scripts_dir / "test.py"
            if test_script.exists():
                results['checks']['has_test_script'] = True
            else:
                results['checks']['has_test_script'] = False
                results['warnings'].append("No test.py script found")
        else:
            results['checks']['has_scripts'] = False
            results['warnings'].append("No scripts directory")

        # Run skill-specific tests if they exist
        test_script = skill_path / "scripts" / "test.py"
        if test_script.exists():
            try:
                result = subprocess.run(
                    [sys.executable, str(test_script)],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                results['checks']['tests_passed'] = result.returncode == 0
                if result.returncode != 0:
                    results['errors'].append(f"Tests failed: {result.stderr[:200]}")
            except subprocess.TimeoutExpired:
                results['checks']['tests_passed'] = False
                results['errors'].append("Tests timed out")
            except Exception as e:
                results['checks']['tests_passed'] = False
                results['errors'].append(f"Test execution error: {str(e)}")

        # Determine overall status
        if results['errors']:
            results['status'] = 'failed'
        elif results['warnings']:
            results['status'] = 'passed_with_warnings'
        else:
            results['status'] = 'passed'

        return results

    def run_all_evaluations(self) -> dict:
        """Run evaluations for all skills."""
        skills = self.discover_skills()
        print(f"\n📊 Found {len(skills)} skills to evaluate")

        all_results = {
            'timestamp': datetime.now().isoformat(),
            'total_skills': len(skills),
            'passed': 0,
            'passed_with_warnings': 0,
            'failed': 0,
            'skills': {}
        }

        for skill_path in skills:
            result = self.evaluate_skill(skill_path)
            all_results['skills'][skill_path.name] = result

            if result['status'] == 'passed':
                all_results['passed'] += 1
            elif result['status'] == 'passed_with_warnings':
                all_results['passed_with_warnings'] += 1
            else:
                all_results['failed'] += 1

        return all_results

    def print_summary(self, results: dict):
        """Print evaluation summary."""
        print("\n" + "="*60)
        print("📊 SKILL EVALUATION SUMMARY")
        print("="*60)
        print(f"Total Skills: {results['total_skills']}")
        print(f"✅ Passed: {results['passed']}")
        print(f"⚠️  Passed with Warnings: {results['passed_with_warnings']}")
        print(f"❌ Failed: {results['failed']}")
        print("="*60)

        # Print details for failed skills
        if results['failed'] > 0:
            print("\n❌ FAILED SKILLS:")
            for name, skill_result in results['skills'].items():
                if skill_result['status'] == 'failed':
                    print(f"\n  {name}:")
                    for error in skill_result['errors']:
                        print(f"    - {error}")

        # Print warnings
        if results['passed_with_warnings'] > 0:
            print("\n⚠️  SKILLS WITH WARNINGS:")
            for name, skill_result in results['skills'].items():
                if skill_result['status'] == 'passed_with_warnings':
                    print(f"\n  {name}:")
                    for warning in skill_result['warnings']:
                        print(f"    - {warning}")

        print("\n" + "="*60)

    def save_results(self, results: dict, output_path: Optional[Path] = None):
        """Save results to JSON file."""
        if output_path is None:
            output_path = Path(".agents/skills/evals/results.json")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)

        print(f"\n💾 Results saved to: {output_path}")


def main():
    """Run skill evaluations."""
    evaluator = SkillEvaluator()
    results = evaluator.run_all_evaluations()
    evaluator.print_summary(results)
    evaluator.save_results(results)

    # Exit with error code if any skills failed
    if results['failed'] > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
