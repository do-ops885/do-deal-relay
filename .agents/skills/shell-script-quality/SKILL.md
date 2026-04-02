---
name: shell-script-quality
description: "Lint, test, and ensure quality of shell scripts. Use when writing bash scripts, reviewing shell code, or establishing CI/CD shell script validation."
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
version: 1.0.0
author: d-oit
tags: [shell, bash, linting, testing, quality, scripts]
---

# Shell Script Quality

Ensure shell scripts are robust, portable, and maintainable through linting, testing, and best practices.

## When To Use

- Writing new shell scripts (`.sh`, `.bash`)
- Reviewing existing scripts for quality issues
- Setting up CI/CD pipeline for script validation
- Debugging shell script failures
- Converting complex scripts to safer alternatives

## Required Inputs

```text
SCRIPT_PATH: Path to shell script to validate
MODE: (lint/test/review/fix)
```

## Quick Start

```bash
# Lint a script
shellcheck your-script.sh

# Syntax check only
bash -n your-script.sh

# Run with tracing
bash -x your-script.sh

# Auto-fix where possible
shellcheck --format=diff your-script.sh | patch -p1
```

## Quality Workflow

### 1. Lint with ShellCheck

```bash
shellcheck your-script.sh
```

**Common Issues:**

| Issue                | Code   | Severity |
| -------------------- | ------ | -------- |
| Unquoted variables   | SC2086 | Warning  |
| Missing shebang      | SC2148 | Error    |
| cd without check     | SC2164 | Warning  |
| Unused variables     | SC2034 | Info     |
| Command substitution | SC2006 | Style    |

### 2. Test Script Execution

```bash
bash -n your-script.sh      # Syntax check
bash -x your-script.sh      # Trace mode
```

### 3. Set Strict Mode

```bash
#!/bin/bash
set -euo pipefail
# -e: Exit on error
# -u: Error on unset variables
# -o pipefail: Catch errors in pipelines
```

### 4. Validate Portability

```bash
checkbashisms your-script.sh    # Check bashisms (POSIX sh)
dash your-script.sh             # Test with POSIX sh
```

## Best Practices

### Always Use Shebang

```bash
#!/bin/bash
# or
#!/bin/sh  # For POSIX-compliant scripts
```

### Quote All Variables

```bash
rm -rf "$DIR/$FILE"     # Good
rm -rf $DIR/$FILE       # Bad - dangerous if spaces
```

### Check Command Results

```bash
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed"
    exit 1
fi
```

### Use Functions for Modularity

```bash
#!/bin/bash
set -euo pipefail

main() {
    validate_inputs "$@"
    process_data
    output_results
}

validate_inputs() {
    [[ $# -gt 0 ]] || { echo "Usage: $0 <input>"; exit 1; }
}

main "$@"
```

### Handle Errors Gracefully

```bash
cleanup() { rm -f "$TEMP_FILE"; }
trap cleanup EXIT
```

## Quick Fixes

| Problem | Quick Fix                                          |
| ------- | -------------------------------------------------- |
| SC2086  | `"$variable"`                                      |
| SC2006  | `$(cmd)` instead of `\`cmd\``                      |
| SC2164  | `cd dir \|\| exit`                                 |
| SC2181  | `if cmd; then` instead of `cmd; if [[ $? -eq 0 ]]` |
| SC2230  | `command -v` instead of `which`                    |

## References

- [references/examples.md](references/examples.md) - Extended examples, CI/CD templates, testing patterns
- [references/shellcheck-codes.md](references/shellcheck-codes.md) - Common ShellCheck codes and fixes
- [references/bash-best-practices.md](references/bash-best-practices.md) - Bash-specific patterns
- [references/posix-portability.md](references/posix-portability.md) - POSIX sh portability guide

## Version History

- 1.0.0 (2025-01-21) - Initial release
