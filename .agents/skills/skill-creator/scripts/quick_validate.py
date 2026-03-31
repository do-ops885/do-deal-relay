#!/usr/bin/env python3
"""
Quick validation of skill structure and content.
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Optional


def validate_frontmatter(content: str) -> tuple[bool, list[str]]:
    """Validate YAML frontmatter in SKILL.md."""
    errors = []
    
    if not content.startswith("---"):
        errors.append("Missing opening frontmatter delimiter '---'")
        return False, errors
    
    # Find frontmatter boundaries
    lines = content.split('\n')
    if len(lines) < 3:
        errors.append("File too short for proper frontmatter")
        return False, errors
    
    # Find second ---
    frontmatter_end = -1
    for i, line in enumerate(lines[1:], 1):
        if line.strip() == "---":
            frontmatter_end = i
            break
    
    if frontmatter_end == -1:
        errors.append("Missing closing frontmatter delimiter '---'")
        return False, errors
    
    # Extract frontmatter content
    frontmatter_content = '\n'.join(lines[1:frontmatter_end])
    
    # Required fields
    required_fields = {
        'name': r'^name:\s*(.+)$',
        'description': r'^description:\s*(.+)$',
        'version': r'^version:\s*(.+)$',
        'author': r'^author:\s*(.+)$'
    }
    
    for field, pattern in required_fields.items():
        if not re.search(pattern, frontmatter_content, re.MULTILINE):
            errors.append(f"Missing or invalid frontmatter field: {field}")
    
    # Validate version format (semver-like)
    version_match = re.search(r'^version:\s*(\d+\.\d+\.\d+)', frontmatter_content, re.MULTILINE)
    if version_match:
        version = version_match.group(1)
        parts = version.split('.')
        if len(parts) != 3 or not all(p.isdigit() for p in parts):
            errors.append(f"Invalid version format: {version} (expected: X.Y.Z)")
    
    return len(errors) == 0, errors


def validate_line_count(content: str, max_lines: int = 250) -> tuple[bool, int]:
    """Check if content exceeds line limit."""
    lines = content.split('\n')
    line_count = len(lines)
    return line_count <= max_lines, line_count


def validate_structure(skill_path: Path) -> tuple[bool, list[str], list[str]]:
    """Validate the overall skill structure."""
    errors = []
    warnings = []
    
    # Check SKILL.md exists
    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        errors.append("Missing SKILL.md (required)")
    else:
        content = skill_md.read_text()
        
        # Validate frontmatter
        frontmatter_valid, frontmatter_errors = validate_frontmatter(content)
        errors.extend(frontmatter_errors)
        
        # Validate line count
        line_count_valid, line_count = validate_line_count(content)
        if not line_count_valid:
            errors.append(f"SKILL.md exceeds {250} lines ({line_count} lines)")
        else:
            if line_count and line_count > 200:
                warnings.append(f"SKILL.md approaching line limit ({line_count}/250 lines)")
        
        # Check for required sections
        required_sections = ['#', '## Overview', '## Quick Start']
        content_lower = content.lower()
        
        if '# ' not in content:
            warnings.append("Missing main heading (H1)")
        
        if '## overview' not in content_lower:
            warnings.append("Missing 'Overview' section")
        
        if '## quick start' not in content_lower and '## getting started' not in content_lower:
            warnings.append("Missing 'Quick Start' or 'Getting Started' section")
        
        # Check for code examples
        if '```' not in content:
            warnings.append("No code examples found")
        
        # Check for broken internal links (simple check)
        link_pattern = r'\[([^\]]+)\]\(([^)]+)\)'
        links = re.findall(link_pattern, content)
        for text, link in links:
            if not link.startswith(('http://', 'https://', '#')):
                # Check if local file exists
                target_path = skill_path / link
                if not target_path.exists():
                    warnings.append(f"Potential broken link: {link}")
    
    # Check references directory
    refs_dir = skill_path / "references"
    if not refs_dir.exists():
        warnings.append("Missing references/ directory")
    elif not any(refs_dir.iterdir()):
        warnings.append("references/ directory is empty")
    
    # Check examples directory (optional but recommended)
    examples_dir = skill_path / "examples"
    if not examples_dir.exists():
        warnings.append("Missing examples/ directory (recommended)")
    
    # Check scripts directory (optional)
    scripts_dir = skill_path / "scripts"
    if not scripts_dir.exists():
        warnings.append("Missing scripts/ directory (optional)")
    
    return len(errors) == 0, errors, warnings


def format_validation_report(skill_path: Path, is_valid: bool, errors: list[str], warnings: list[str]) -> str:
    """Format validation results for display."""
    lines = []
    lines.append(f"Skill: {skill_path.name}")
    lines.append(f"Path: {skill_path.absolute()}")
    lines.append("")
    
    if is_valid and not warnings:
        lines.append("Status: ✓ PASS")
        lines.append("")
        lines.append("All validation checks passed!")
    elif is_valid:
        lines.append("Status: ✓ PASS (with warnings)")
        lines.append("")
        if warnings:
            lines.append("Warnings:")
            for warning in warnings:
                lines.append(f"  ⚠ {warning}")
    else:
        lines.append("Status: ✗ FAIL")
        lines.append("")
        if errors:
            lines.append("Errors:")
            for error in errors:
                lines.append(f"  ✗ {error}")
        if warnings:
            lines.append("")
            lines.append("Warnings:")
            for warning in warnings:
                lines.append(f"  ⚠ {warning}")
    
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Quick validation of skill structure and content"
    )
    parser.add_argument(
        "skill_path",
        help="Path to the skill directory"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as errors"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON"
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Only show errors"
    )
    
    args = parser.parse_args()
    skill_path = Path(args.skill_path)
    
    if not skill_path.exists():
        print(f"Error: Skill path not found: {skill_path}", file=sys.stderr)
        sys.exit(1)
    
    if not skill_path.is_dir():
        print(f"Error: Skill path is not a directory: {skill_path}", file=sys.stderr)
        sys.exit(1)
    
    # Run validation
    is_valid, errors, warnings = validate_structure(skill_path)
    
    # Treat warnings as errors if strict mode
    if args.strict and warnings:
        is_valid = False
        errors.extend(warnings)
        warnings = []
    
    # Output results
    if args.json:
        import json
        result = {
            "valid": is_valid,
            "skill": skill_path.name,
            "errors": errors,
            "warnings": warnings
        }
        print(json.dumps(result, indent=2))
    elif not args.quiet:
        print(format_validation_report(skill_path, is_valid, errors, warnings))
    else:
        # Quiet mode - only show issues
        if errors:
            for error in errors:
                print(f"ERROR: {error}")
        if warnings and not args.strict:
            for warning in warnings:
                print(f"WARNING: {warning}")
    
    # Exit with appropriate code
    sys.exit(0 if is_valid else 1)


if __name__ == "__main__":
    main()
