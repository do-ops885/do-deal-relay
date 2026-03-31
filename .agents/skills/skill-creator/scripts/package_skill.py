#!/usr/bin/env python3
"""
Package a skill into a distributable .skill file.
"""

import argparse
import json
import os
import sys
import zipfile
from datetime import datetime
from pathlib import Path


def validate_skill_structure(skill_path: Path) -> tuple[bool, list[str]]:
    """Validate the skill structure before packaging."""
    errors = []
    
    # Check SKILL.md exists
    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        errors.append("Missing SKILL.md")
    else:
        # Check frontmatter
        content = skill_md.read_text()
        if not content.startswith("---"):
            errors.append("SKILL.md missing frontmatter")
        else:
            required_fields = ["name:", "description:", "version:", "author:"]
            for field in required_fields:
                if field not in content:
                    errors.append(f"SKILL.md missing frontmatter field: {field}")
        
        # Check line count
        lines = content.split('\n')
        if len(lines) > 250:
            errors.append(f"SKILL.md exceeds 250 lines ({len(lines)} lines)")
    
    # Check references directory
    if not (skill_path / "references").exists():
        errors.append("Missing references/ directory")
    
    return len(errors) == 0, errors


def read_version(skill_path: Path) -> str:
    """Extract version from SKILL.md frontmatter."""
    skill_md = skill_path / "SKILL.md"
    content = skill_md.read_text()
    
    for line in content.split('\n'):
        if line.strip().startswith("version:"):
            return line.split(':')[1].strip()
    
    return "1.0.0"


def read_skill_name(skill_path: Path) -> str:
    """Extract name from SKILL.md frontmatter."""
    skill_md = skill_path / "SKILL.md"
    content = skill_md.read_text()
    
    for line in content.split('\n'):
        if line.strip().startswith("name:"):
            return line.split(':')[1].strip()
    
    return skill_path.name


def create_package_metadata(skill_path: Path) -> dict:
    """Create metadata for the package."""
    return {
        "name": read_skill_name(skill_path),
        "version": read_version(skill_path),
        "created_at": datetime.now().isoformat(),
        "files": [],
        "structure": {
            "has_references": (skill_path / "references").exists(),
            "has_examples": (skill_path / "examples").exists(),
            "has_scripts": (skill_path / "scripts").exists()
        }
    }


def package_skill(skill_path: Path, output_path: Path, compress: bool = True) -> None:
    """Package the skill into a .skill file."""
    skill_name = read_skill_name(skill_path)
    version = read_version(skill_path)
    
    # Determine output filename
    if output_path.is_dir():
        output_file = output_path / f"{skill_name}-{version}.skill"
    else:
        output_file = output_path
    
    # Create package
    with zipfile.ZipFile(output_file, 'w', 
                         compression=zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED) as zf:
        # Add all files from skill directory
        for file_path in skill_path.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(skill_path)
                zf.write(file_path, arcname)
                print(f"Added: {arcname}")
    
    print()
    print(f"Created: {output_file}")
    print(f"Size: {output_file.stat().st_size} bytes")


def main():
    parser = argparse.ArgumentParser(
        description="Package a skill into a distributable .skill file"
    )
    parser.add_argument(
        "skill_path",
        help="Path to the skill directory"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output path (default: <skill-name>-<version>.skill in current directory)"
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip validation before packaging"
    )
    parser.add_argument(
        "--no-compress",
        action="store_true",
        help="Disable compression (faster but larger)"
    )
    parser.add_argument(
        "--extract",
        action="store_true",
        help="Extract a .skill file instead of creating one"
    )
    
    args = parser.parse_args()
    skill_path = Path(args.skill_path)
    
    if args.extract:
        # Extract mode
        if not skill_path.exists():
            print(f"Error: Skill file not found: {skill_path}")
            sys.exit(1)
        
        # Determine extract directory
        extract_dir = Path(args.output) if args.output else Path(skill_path.stem)
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"Extracting: {skill_path}")
        print(f"To: {extract_dir}")
        
        with zipfile.ZipFile(skill_path, 'r') as zf:
            zf.extractall(extract_dir)
        
        print("Extraction complete!")
        return
    
    # Package mode
    if not skill_path.exists():
        print(f"Error: Skill directory not found: {skill_path}")
        sys.exit(1)
    
    if not skill_path.is_dir():
        print(f"Error: Skill path is not a directory: {skill_path}")
        sys.exit(1)
    
    # Validate
    if not args.no_validate:
        print("Validating skill structure...")
        is_valid, errors = validate_skill_structure(skill_path)
        
        if not is_valid:
            print("Validation failed:")
            for error in errors:
                print(f"  - {error}")
            print()
            print("Use --no-validate to skip validation")
            sys.exit(1)
        
        print("Validation passed!")
        print()
    
    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        skill_name = read_skill_name(skill_path)
        version = read_version(skill_path)
        output_path = Path(f"{skill_name}-{version}.skill")
    
    # Package
    print(f"Packaging skill: {skill_path}")
    package_skill(skill_path, output_path, compress=not args.no_compress)
    print()
    print("Packaging complete!")
    print()
    print("To install this skill:")
    print(f"  python package_skill.py {output_path} --extract --output <skills-dir>/")


if __name__ == "__main__":
    main()
