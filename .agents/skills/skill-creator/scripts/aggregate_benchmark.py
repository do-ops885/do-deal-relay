#!/usr/bin/env python3
"""
Aggregate and analyze benchmark results from multiple test runs.
"""

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


def load_result_file(file_path: Path) -> dict[str, Any]:
    """Load a single benchmark result file."""
    try:
        return json.loads(file_path.read_text())
    except json.JSONDecodeError as e:
        print(f"Warning: Failed to parse {file_path}: {e}", file=sys.stderr)
        return {}
    except Exception as e:
        print(f"Warning: Failed to read {file_path}: {e}", file=sys.stderr)
        return {}


def aggregate_results(results_dir: Path) -> dict[str, Any]:
    """Aggregate all benchmark results from a directory."""
    all_results = []
    
    # Find all JSON files in the directory
    for result_file in results_dir.rglob("*.json"):
        data = load_result_file(result_file)
        if data:
            all_results.append(data)
    
    if not all_results:
        return {}
    
    # Aggregate metrics
    aggregated = {
        "total_runs": len(all_results),
        "total_tests": 0,
        "passed_tests": 0,
        "failed_tests": 0,
        "by_skill": defaultdict(lambda: {
            "runs": 0,
            "tests": 0,
            "passed": 0,
            "failed": 0,
            "scores": []
        }),
        "by_test_type": defaultdict(lambda: {
            "tests": 0,
            "passed": 0,
            "failed": 0,
            "scores": []
        }),
        "errors": defaultdict(int)
    }
    
    for result in all_results:
        skill_name = result.get("skill", "unknown")
        skill_data = aggregated["by_skill"][skill_name]
        
        skill_data["runs"] += 1
        
        # Process tests
        tests = result.get("tests", [])
        for test in tests:
            skill_data["tests"] += 1
            aggregated["total_tests"] += 1
            
            # Track by type
            test_type = test.get("type", "unknown")
            type_data = aggregated["by_test_type"][test_type]
            type_data["tests"] += 1
            
            # Track pass/fail
            if test.get("passed", False):
                skill_data["passed"] += 1
                aggregated["passed_tests"] += 1
                type_data["passed"] += 1
            else:
                skill_data["failed"] += 1
                aggregated["failed_tests"] += 1
                type_data["failed"] += 1
                
                # Track error types
                error = test.get("error", "unknown")
                aggregated["errors"][error] += 1
            
            # Track scores
            score = test.get("score")
            if score is not None:
                skill_data["scores"].append(score)
                type_data["scores"].append(score)
    
    # Calculate derived metrics
    if aggregated["total_tests"] > 0:
        aggregated["overall_success_rate"] = (
            aggregated["passed_tests"] / aggregated["total_tests"] * 100
        )
    else:
        aggregated["overall_success_rate"] = 0
    
    # Calculate per-skill metrics
    for skill_name, skill_data in aggregated["by_skill"].items():
        if skill_data["tests"] > 0:
            skill_data["success_rate"] = (
                skill_data["passed"] / skill_data["tests"] * 100
            )
        else:
            skill_data["success_rate"] = 0
        
        if skill_data["scores"]:
            skill_data["mean_score"] = sum(skill_data["scores"]) / len(skill_data["scores"])
        else:
            skill_data["mean_score"] = 0
    
    # Calculate per-type metrics
    for type_name, type_data in aggregated["by_test_type"].items():
        if type_data["tests"] > 0:
            type_data["success_rate"] = (
                type_data["passed"] / type_data["tests"] * 100
            )
        else:
            type_data["success_rate"] = 0
        
        if type_data["scores"]:
            type_data["mean_score"] = sum(type_data["scores"]) / len(type_data["scores"])
        else:
            type_data["mean_score"] = 0
    
    # Convert defaultdicts to regular dicts for JSON serialization
    aggregated["by_skill"] = dict(aggregated["by_skill"])
    aggregated["by_test_type"] = dict(aggregated["by_test_type"])
    aggregated["errors"] = dict(aggregated["errors"])
    
    return aggregated


def format_report(data: dict[str, Any]) -> str:
    """Format aggregated data as a human-readable report."""
    lines = []
    
    lines.append("# Benchmark Results Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now().isoformat()}")
    lines.append("")
    
    # Summary
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Total runs: {data.get('total_runs', 0)}")
    lines.append(f"- Total tests: {data.get('total_tests', 0)}")
    lines.append(f"- Passed: {data.get('passed_tests', 0)}")
    lines.append(f"- Failed: {data.get('failed_tests', 0)}")
    lines.append(f"- Overall success rate: {data.get('overall_success_rate', 0):.1f}%")
    lines.append("")
    
    # By skill
    by_skill = data.get('by_skill', {})
    if by_skill:
        lines.append("## Results by Skill")
        lines.append("")
        lines.append("| Skill | Runs | Tests | Passed | Failed | Success Rate | Mean Score |")
        lines.append("|-------|------|-------|--------|--------|--------------|------------|")
        
        for skill_name, skill_data in sorted(by_skill.items()):
            lines.append(
                f"| {skill_name} | "
                f"{skill_data['runs']} | "
                f"{skill_data['tests']} | "
                f"{skill_data['passed']} | "
                f"{skill_data['failed']} | "
                f"{skill_data['success_rate']:.1f}% | "
                f"{skill_data['mean_score']:.2f} |"
            )
        lines.append("")
    
    # By test type
    by_type = data.get('by_test_type', {})
    if by_type:
        lines.append("## Results by Test Type")
        lines.append("")
        lines.append("| Type | Tests | Passed | Failed | Success Rate | Mean Score |")
        lines.append("|------|-------|--------|--------|--------------|------------|")
        
        for type_name, type_data in sorted(by_type.items()):
            lines.append(
                f"| {type_name} | "
                f"{type_data['tests']} | "
                f"{type_data['passed']} | "
                f"{type_data['failed']} | "
                f"{type_data['success_rate']:.1f}% | "
                f"{type_data['mean_score']:.2f} |"
            )
        lines.append("")
    
    # Error analysis
    errors = data.get('errors', {})
    if errors:
        lines.append("## Error Analysis")
        lines.append("")
        lines.append("| Error Type | Count |")
        lines.append("|------------|-------|")
        
        for error_type, count in sorted(errors.items(), key=lambda x: -x[1]):
            lines.append(f"| {error_type} | {count} |")
        lines.append("")
    
    # Recommendations
    overall_success = data.get('overall_success_rate', 0)
    lines.append("## Recommendations")
    lines.append("")
    
    if overall_success >= 95:
        lines.append("- Status: EXCELLENT - Skills are performing very well")
    elif overall_success >= 85:
        lines.append("- Status: GOOD - Minor improvements recommended")
        if errors:
            top_error = max(errors.items(), key=lambda x: x[1])[0]
            lines.append(f"- Focus area: Address '{top_error}' errors")
    elif overall_success >= 70:
        lines.append("- Status: FAIR - Significant improvements needed")
        lines.append("- Review failing tests and update skills accordingly")
    else:
        lines.append("- Status: POOR - Major revision required")
        lines.append("- Consider redesigning skill approach")
    
    lines.append("")
    
    return '\n'.join(lines)


def compare_results(baseline: dict, current: dict) -> str:
    """Compare two sets of results and show differences."""
    lines = []
    
    lines.append("# Benchmark Comparison")
    lines.append("")
    lines.append(f"Generated: {datetime.now().isoformat()}")
    lines.append("")
    
    # Overall comparison
    lines.append("## Overall Changes")
    lines.append("")
    
    baseline_success = baseline.get('overall_success_rate', 0)
    current_success = current.get('overall_success_rate', 0)
    change = current_success - baseline_success
    
    direction = "↑" if change > 0 else "↓" if change < 0 else "→"
    lines.append(f"Success rate: {baseline_success:.1f}% → {current_success:.1f}% ({direction} {abs(change):.1f}%)")
    
    # Per-skill comparison
    lines.append("")
    lines.append("## Per-Skill Changes")
    lines.append("")
    lines.append("| Skill | Baseline | Current | Change |")
    lines.append("|-------|----------|---------|--------|")
    
    baseline_skills = baseline.get('by_skill', {})
    current_skills = current.get('by_skill', {})
    all_skills = set(baseline_skills.keys()) | set(current_skills.keys())
    
    for skill in sorted(all_skills):
        baseline_rate = baseline_skills.get(skill, {}).get('success_rate', 0)
        current_rate = current_skills.get(skill, {}).get('success_rate', 0)
        change = current_rate - baseline_rate
        
        if skill not in baseline_skills:
            lines.append(f"| {skill} | N/A | {current_rate:.1f}% | NEW |")
        elif skill not in current_skills:
            lines.append(f"| {skill} | {baseline_rate:.1f}% | N/A | REMOVED |")
        else:
            direction = "↑" if change > 0 else "↓" if change < 0 else "→"
            lines.append(f"| {skill} | {baseline_rate:.1f}% | {current_rate:.1f}% | {direction} {abs(change):.1f}% |")
    
    lines.append("")
    
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Aggregate and analyze benchmark results"
    )
    parser.add_argument(
        "results_dir",
        help="Directory containing benchmark result files (JSON)"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output file path (default: stdout)"
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "markdown", "text"],
        default="markdown",
        help="Output format"
    )
    parser.add_argument(
        "--compare",
        help="Compare against baseline results directory"
    )
    parser.add_argument(
        "--skill",
        help="Filter results to specific skill"
    )
    
    args = parser.parse_args()
    results_dir = Path(args.results_dir)
    
    if not results_dir.exists():
        print(f"Error: Results directory not found: {results_dir}", file=sys.stderr)
        sys.exit(1)
    
    if not results_dir.is_dir():
        print(f"Error: Results path is not a directory: {results_dir}", file=sys.stderr)
        sys.exit(1)
    
    # Aggregate results
    aggregated = aggregate_results(results_dir)
    
    if not aggregated:
        print("Error: No valid benchmark results found", file=sys.stderr)
        sys.exit(1)
    
    # Filter by skill if specified
    if args.skill:
        if args.skill not in aggregated.get('by_skill', {}):
            print(f"Error: Skill '{args.skill}' not found in results", file=sys.stderr)
            sys.exit(1)
        
        # Filter the data
        aggregated['by_skill'] = {args.skill: aggregated['by_skill'][args.skill]}
        aggregated['total_runs'] = aggregated['by_skill'][args.skill]['runs']
        aggregated['total_tests'] = aggregated['by_skill'][args.skill]['tests']
        aggregated['passed_tests'] = aggregated['by_skill'][args.skill]['passed']
        aggregated['failed_tests'] = aggregated['by_skill'][args.skill]['failed']
        if aggregated['total_tests'] > 0:
            aggregated['overall_success_rate'] = (
                aggregated['passed_tests'] / aggregated['total_tests'] * 100
            )
    
    # Compare mode
    if args.compare:
        baseline_dir = Path(args.compare)
        if not baseline_dir.exists():
            print(f"Error: Baseline directory not found: {baseline_dir}", file=sys.stderr)
            sys.exit(1)
        
        baseline = aggregate_results(baseline_dir)
        output = compare_results(baseline, aggregated)
    else:
        # Generate report
        if args.format == "json":
            output = json.dumps(aggregated, indent=2)
        elif args.format in ["markdown", "text"]:
            output = format_report(aggregated)
        else:
            output = json.dumps(aggregated, indent=2)
    
    # Write or print output
    if args.output:
        output_path = Path(args.output)
        output_path.write_text(output)
        print(f"Report written to: {output_path}")
    else:
        print(output)


if __name__ == "__main__":
    main()
