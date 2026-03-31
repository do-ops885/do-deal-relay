# Pre-commit Examples

This directory contains example `.pre-commit-config.yaml` files for different project types.

## Available Examples

### Python Projects

See [python-project.yaml](python-project.yaml) for a complete Python project setup with:

- Black (code formatter)
- isort (import sorting)
- flake8 (linter)
- mypy (type checking)
- pytest (test runner)

### JavaScript/TypeScript Projects

See [javascript-project.yaml](javascript-project.yaml) for JS/TS projects with:

- ESLint
- Prettier
- TypeScript compiler

### Multi-Language Projects

See [multi-language.yaml](multi-language.yaml) for projects using multiple languages.

### Minimal Setup

See [minimal.yaml](minimal.yaml) for the bare minimum configuration.

## Using Examples

1. Copy the appropriate example to your project root:

   ```bash
   cp examples/python-project.yaml .pre-commit-config.yaml
   ```

2. Install pre-commit:

   ```bash
   pip install pre-commit
   pre-commit install
   ```

3. Run on all files:
   ```bash
   pre-commit run --all-files
   ```

## Generating Custom Config

Use the init script to auto-generate a config based on your project:

```bash
python scripts/init_precommit.py
```
