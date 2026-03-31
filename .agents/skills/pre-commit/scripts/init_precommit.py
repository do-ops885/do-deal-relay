#!/usr/bin/env python3
"""
Initialize pre-commit configuration for a project based on detected languages.
"""

import argparse
import os
import sys
from pathlib import Path


def detect_project_languages(project_path: Path) -> list:
    """Detect languages used in the project."""
    languages = []

    # Check for Python
    if any(project_path.glob("*.py")) or (project_path / "pyproject.toml").exists() or (project_path / "setup.py").exists():
        languages.append("python")

    # Check for JavaScript/TypeScript
    if any(project_path.glob("*.js")) or any(project_path.glob("*.ts")) or (project_path / "package.json").exists():
        languages.append("javascript")

    # Check for Go
    if any(project_path.glob("*.go")) or (project_path / "go.mod").exists():
        languages.append("go")

    # Check for Rust
    if (project_path / "Cargo.toml").exists():
        languages.append("rust")

    # Check for Ruby
    if (project_path / "Gemfile").exists():
        languages.append("ruby")

    # Check for Java
    if any(project_path.glob("*.java")) or (project_path / "pom.xml").exists():
        languages.append("java")

    return languages


def generate_config(languages: list) -> str:
    """Generate pre-commit config based on detected languages."""
    config_lines = ["repos:"]

    # Always include general hooks
    config_lines.extend([
        "",
        "  # General hooks for all projects",
        "  - repo: https://github.com/pre-commit/pre-commit-hooks",
        "    rev: v4.5.0",
        "    hooks:",
        "      - id: check-yaml",
        "      - id: check-json",
        "      - id: check-toml",
        "      - id: end-of-file-fixer",
        "      - id: trailing-whitespace",
        "      - id: check-added-large-files",
        "        args: [--maxkb=1000]",
        "      - id: check-merge-conflict",
        "      - id: detect-private-key",
    ])

    # Python-specific hooks
    if "python" in languages:
        config_lines.extend([
            "",
            "  # Python hooks",
            "  - repo: https://github.com/psf/black",
            "    rev: 23.12.1",
            "    hooks:",
            "      - id: black",
            "        language_version: python3.11",
            "",
            "  - repo: https://github.com/pycqa/isort",
            "    rev: 5.13.2",
            "    hooks:",
            "      - id: isort",
            "        args: [--profile, black]",
            "",
            "  - repo: https://github.com/pycqa/flake8",
            "    rev: 7.0.0",
            "    hooks:",
            "      - id: flake8",
        ])

    # JavaScript/TypeScript hooks
    if "javascript" in languages:
        config_lines.extend([
            "",
            "  # JavaScript/TypeScript hooks",
            "  - repo: https://github.com/pre-commit/mirrors-eslint",
            "    rev: v8.56.0",
            "    hooks:",
            "      - id: eslint",
            "        additional_dependencies:",
            "          - eslint@8.56.0",
            "",
            "  - repo: https://github.com/pre-commit/mirrors-prettier",
            "    rev: v3.1.0",
            "    hooks:",
            "      - id: prettier",
        ])

    # Go hooks
    if "go" in languages:
        config_lines.extend([
            "",
            "  # Go hooks",
            "  - repo: https://github.com/dnephin/pre-commit-golang",
            "    rev: v0.5.1",
            "    hooks:",
            "      - id: go-fmt",
            "      - id: go-vet",
            "      - id: golangci-lint",
        ])

    # Rust hooks
    if "rust" in languages:
        config_lines.extend([
            "",
            "  # Rust hooks",
            "  - repo: https://github.com/doublify/pre-commit-rust",
            "    rev: v1.0",
            "    hooks:",
            "      - id: fmt",
            "      - id: cargo-check",
        ])

    # Ruby hooks
    if "ruby" in languages:
        config_lines.extend([
            "",
            "  # Ruby hooks",
            "  - repo: https://github.com/rubocop-hq/rubocop",
            "    rev: v1.60.1",
            "    hooks:",
            "      - id: rubocop",
        ])

    return "\n".join(config_lines)


def init_precommit(project_path: Path, dry_run: bool = False) -> None:
    """Initialize pre-commit for a project."""
    config_path = project_path / ".pre-commit-config.yaml"

    # Check if config already exists
    if config_path.exists():
        print(f"Configuration already exists at {config_path}")
        response = input("Overwrite? [y/N]: ").lower()
        if response != 'y':
            print("Aborted.")
            return

    # Detect languages
    languages = detect_project_languages(project_path)
    print(f"Detected languages: {', '.join(languages) if languages else 'none'}")

    # Generate config
    config = generate_config(languages)

    if dry_run:
        print("\nGenerated configuration:")
        print("=" * 50)
        print(config)
        print("=" * 50)
    else:
        # Write config
        config_path.write_text(config)
        print(f"Created: {config_path}")

        # Install pre-commit
        print("\nNext steps:")
        print("1. Install pre-commit: pip install pre-commit")
        print("2. Install hooks: pre-commit install")
        print("3. Run on all files: pre-commit run --all-files")


def main():
    parser = argparse.ArgumentParser(
        description="Initialize pre-commit configuration for a project"
    )
    parser.add_argument(
        "--project-path",
        default=".",
        help="Path to project root (default: current directory)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show generated config without writing"
    )

    args = parser.parse_args()

    project_path = Path(args.project_path).resolve()

    if not project_path.exists():
        print(f"Error: Project path does not exist: {project_path}")
        sys.exit(1)

    if not (project_path / ".git").exists():
        print(f"Warning: {project_path} does not appear to be a git repository")
        response = input("Continue anyway? [y/N]: ").lower()
        if response != 'y':
            print("Aborted.")
            sys.exit(1)

    init_precommit(project_path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
