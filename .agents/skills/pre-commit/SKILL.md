---
name: pre-commit
description: Manage and maintain multi-language pre-commit hooks for code quality
version: 1.0.0
author: d-oit
tags: [git, hooks, linting, formatting]
---

# pre-commit

A framework for managing and maintaining multi-language pre-commit hooks.

## Overview

pre-commit is a multi-language package manager for pre-commit hooks. It runs checks before every commit to identify issues like trailing whitespace, debug statements, and more. This skill covers installation, configuration, updating, and running hooks.

## Quick Start

```bash
# Install pre-commit
pip install pre-commit

# Create config file .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: check-yaml
      - id: end-of-file-fixer
      - id: trailing-whitespace
EOF

# Install git hooks
pre-commit install

# Run on all files initially
pre-commit run --all-files
```

## Commands

### Install and Setup

```bash
pre-commit install                    # Install hooks (default: pre-commit stage)
pre-commit install --install-hooks    # Install and setup environments
pre-commit install --overwrite        # Force overwrite existing hooks
pre-commit uninstall                  # Remove hooks
```

### Run Hooks

```bash
pre-commit run                        # Run on staged files
pre-commit run --all-files            # Run on all files
pre-commit run <hook-id>              # Run specific hook
pre-commit run --files <paths>        # Run on specific files
pre-commit run --show-diff-on-failure # Show diff on failure
```

### Update Hooks

```bash
pre-commit autoupdate                 # Update to latest tags
pre-commit autoupdate --repo <url>    # Update specific repo
pre-commit autoupdate --bleeding-edge # Update to latest commit
pre-commit autoupdate --freeze        # Pin to commit hashes
```

### Maintenance

```bash
pre-commit validate-config            # Validate configuration
pre-commit clean                      # Clean cache
pre-commit gc                         # Clean unused cached repos
pre-commit sample-config              # Generate sample config
```

## Configuration

### Top-Level Options

```yaml
exclude: "^$" # Global exclude pattern
fail_fast: false # Stop after first failure
default_stages: [pre-commit] # Default git stages
default_language_version:
  python: python3.11 # Default Python version
minimum_pre_commit_version: "3.0.0"
```

### Repository Options

```yaml
repos:
  - repo: https://github.com/user/repo
    rev: v1.0.0 # Tag, SHA, or branch
    hooks:
      - id: hook-id
        name: Custom Name
        args: [--arg1, --arg2] # Additional arguments
        files: \.(py|js)$ # File pattern regex
        exclude: ^tests/ # Exclude pattern
        types: [python] # File types to match
        exclude_types: [] # Types to exclude
        stages: [pre-commit] # Git stages
        always_run: false # Run even with no matching files
        fail_fast: false # Stop on this hook failure
        verbose: false # Always show output
```

### Local Hooks

```yaml
repos:
  - repo: local
    hooks:
      - id: custom-lint
        name: Custom Linter
        entry: ./scripts/lint.sh
        language: script # or python, system, etc.
        files: \.(py|js)$
```

## Git Stages

Available stages: `pre-commit`, `pre-merge-commit`, `pre-push`, `commit-msg`, `post-checkout`, `post-commit`, `prepare-commit-msg`.

Set default stages globally:

```yaml
default_install_hook_types: [pre-commit, pre-push]
```

## Common Hooks by Language

### Python

```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 23.12.1
    hooks: [{ id: black }]
  - repo: https://github.com/pycqa/flake8
    rev: 7.0.0
    hooks: [{ id: flake8 }]
  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks: [{ id: isort, args: [--profile, black] }]
```

### General (All Projects)

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: check-yaml
      - id: check-json
      - id: check-toml
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: detect-private-key
```

## Error Handling

| Issue                             | Cause                   | Solution                         |
| --------------------------------- | ----------------------- | -------------------------------- |
| Hook fails but file looks correct | Hook modified file      | Run `git diff` and stage changes |
| Environment installation fails    | Missing dependencies    | Check hook requirements          |
| Hook not found                    | Wrong ID                | Run `pre-commit validate-config` |
| Slow first run                    | Installing environments | Normal behavior, cached after    |

## CI Integration

### GitHub Actions

```yaml
name: pre-commit
on: [push, pull_request]
jobs:
  pre-commit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - uses: pre-commit/action@v3.0.1
```

### Manual CI

```bash
pip install pre-commit
pre-commit run --all-files --show-diff-on-failure
```

## Tips

1. Run `--all-files` when adding new hooks for consistency
2. Use specific tags or SHAs to avoid breaking changes
3. Configure `exclude` patterns for files to skip
4. Set `fail_fast: true` for related hooks
5. Use `--frozen` in CI for reproducibility
6. Run `autoupdate` regularly

## References

- [pre-commit Documentation](https://pre-commit.com/)
- [Supported Hooks](https://pre-commit.com/hooks.html)
- [GitHub Repository](https://github.com/pre-commit/pre-commit)

## Version History

- 1.0.0 (2026-03-31) - Initial release
