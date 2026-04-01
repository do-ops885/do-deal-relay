# Shell Script Examples

Extended examples and detailed patterns for shell script quality.

## Research Pipeline Script

```bash
#!/bin/bash
set -euo pipefail

# research_pipeline.sh - Run deal discovery research

RESEARCH_DIR="${RESEARCH_DIR:-./temp/research}"
SOURCES=("producthunt" "github" "hackernews")

run_research() {
    local source="$1"
    echo "Researching $source..."

    local output="$RESEARCH_DIR/${source}-$(date +%Y%m%d).json"
    mkdir -p "$RESEARCH_DIR"

    case "$source" in
        producthunt)
            curl -s "https://api.producthunt.com/v1/posts" \
                -H "Authorization: Bearer $PH_TOKEN" \
                -o "$output" || {
                echo "Warning: Failed to fetch ProductHunt"
                return 1
            }
            ;;
        github)
            curl -s "https://api.github.com/search/repositories?q=created:>$(date -d '7 days ago' +%Y-%m-%d)" \
                -H "Authorization: token $GITHUB_TOKEN" \
                -o "$output" || {
                echo "Warning: Failed to fetch GitHub"
                return 1
            }
            ;;
    esac

    echo "Saved to $output"
}

main() {
    for source in "${SOURCES[@]}"; do
        run_research "$source" || true  # Continue on individual failures
    done
}

main "$@"
```

## CI Quality Gate Script

```bash
#!/bin/bash
set -euo pipefail

# quality_gate.sh - Validate all scripts before commit

echo "=== Shell Script Quality Gate ==="

# Find all shell scripts
mapfile -t scripts < <(find . -name "*.sh" -type f)

failed=0
for script in "${scripts[@]}"; do
    echo "Checking: $script"

    if ! shellcheck "$script"; then
        echo "FAILED: $script"
        ((failed++))
    fi
done

if [[ $failed -gt 0 ]]; then
    echo "Quality gate failed: $failed scripts have issues"
    exit 1
fi

echo "All scripts passed quality gate"
```

## Testing Strategies

### Unit Testing with Bats

```bash
# Install bats-core
npm install -g bats

# test_script.bats
#!/usr/bin/env bats

@test "script runs without errors" {
    run ./your-script.sh --help
    [ "$status" -eq 0 ]
}

@test "handles missing arguments" {
    run ./your-script.sh
    [ "$status" -eq 1 ]
    [[ "$output" == *"Usage:"* ]]
}
```

### Integration Testing

```bash
#!/bin/bash
# integration_test.sh

TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

# Setup test environment
export TEST_MODE=1
export OUTPUT_DIR="$TEST_DIR"

# Run script under test
./research_pipeline.sh

# Verify outputs
[[ -f "$TEST_DIR/producthunt-*.json" ]] || exit 1
[[ -f "$TEST_DIR/github-*.json" ]] || exit 1

echo "Integration tests passed"
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Shell Script Quality

on: [push, pull_request]

jobs:
  shellcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run ShellCheck
        uses: ludeeus/action-shellcheck@master
        with:
          severity: warning
          format: gcc
```

### Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/koalaman/shellcheck-precommit
    rev: v0.9.0
    hooks:
      - id: shellcheck
        args: ["--severity=warning"]
```

## Best Practice Patterns

### Modular Function Structure

```bash
#!/bin/bash
set -euo pipefail

main() {
    validate_inputs "$@"
    process_data
    output_results
}

validate_inputs() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 <input-file>"
        exit 1
    fi
}

process_data() {
    local input="$1"
    # Processing logic
}

output_results() {
    # Output logic
}

main "$@"
```

### Error Handling with Traps

```bash
cleanup() {
    echo "Cleaning up..."
    rm -f "$TEMP_FILE"
}
trap cleanup EXIT

cleanup_on_error() {
    echo "Error on line $1"
    exit 1
}
trap 'cleanup_on_error $LINENO' ERR
```

### Command Validation

```bash
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed"
    exit 1
fi
```

## Portability Testing

### Check Bashisms

```bash
# Install checkbashisms
apt-get install devscripts
checkbashisms your-script.sh
```

### Test Multiple Shells

```bash
dash your-script.sh  # POSIX sh
bash your-script.sh  # Bash
zsh your-script.sh   # Zsh
```
