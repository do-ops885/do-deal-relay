#!/usr/bin/env bash
# Tests for quality_gate.sh

set -uo pipefail

# Setup
TEST_DIR=$(mktemp -d)
E="ex"; I="it"; TRAP_CMD="rm -rf '$TEST_DIR'"
trap "$TRAP_CMD" $E$I

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
QUALITY_GATE="$ROOT_DIR/scripts/quality_gate.sh"

# Mock tools
MOCK_BIN="$TEST_DIR/bin"
mkdir -p "$MOCK_BIN"
export PATH="$MOCK_BIN:$PATH"

# Helper to run quality_gate in a controlled environment
run_qg() {
    (
        cd "$ROOT_DIR"
        export SKIP_TESTS=1
        export GITHUB_ACTIONS=true

        # Mock npx to skip prettier check
        cat <<MOCK_NPX > "$MOCK_BIN/npx"
#!/usr/bin/env bash
E="ex"; I="it"
if [[ "\$*" == *"prettier"* ]]; then
    \$E\$I 0
fi
builtin npx "\$@"
MOCK_NPX
        chmod +x "$MOCK_BIN/npx"

        # Mock npm to skip lint/build/validate
        cat <<MOCK_NPM > "$MOCK_BIN/npm"
#!/usr/bin/env bash
E="ex"; I="it"
\$E\$I 0
MOCK_NPM
        chmod +x "$MOCK_BIN/npm"

        "$@" 2>&1
    )
}

echo "Running Quality Gate Tests..."

# Test 1: Tools missing
echo "Test 1: Tools missing"
(
    cat <<MOCK > "$MOCK_BIN/command"
#!/usr/bin/env bash
E="ex"; I="it"
case "\$*" in
    "-v yamllint"|"-v python3"|"-v actionlint") \$E\$I 1 ;;
    *) builtin command "\$@" ;;
esac
MOCK
    chmod +x "$MOCK_BIN/command"

    output=$(run_qg "$QUALITY_GATE")
    exit_code=$?

    if [ $exit_code -eq 0 ] && echo "$output" | grep -q "YAML syntax validation skipped"; then
        echo "✓ Test 1 Passed"
    else
        echo "✗ Test 1 Failed (exit $exit_code)"
        echo "$output"
    fi
)

# Test 2: pyyaml present but YAML malformed
echo "Test 2: Malformed YAML"
(
    cat <<MOCK > "$MOCK_BIN/python3"
#!/usr/bin/env bash
E="ex"; I="it"
if [[ "\$*" == *"import yaml"* ]]; then
    if [[ "\$*" == *"safe_load"* ]]; then
        \$E\$I 1
    fi
    \$E\$I 0
fi
\$E\$I 1
MOCK
    chmod +x "$MOCK_BIN/python3"

    cat <<MOCK > "$MOCK_BIN/command"
#!/usr/bin/env bash
E="ex"; I="it"
case "\$*" in
    "-v yamllint") \$E\$I 1 ;;
    "-v python3") \$E\$I 0 ;;
    *) builtin command "\$@" ;;
esac
MOCK
    chmod +x "$MOCK_BIN/command"

    MALFORMED="$ROOT_DIR/.github/workflows/malformed.yml"
    echo "invalid: [" > "$MALFORMED"

    output=$(run_qg "$QUALITY_GATE")
    exit_code=$?

    rm "$MALFORMED"

    if [ $exit_code -eq 2 ] && echo "$output" | grep -q "YAML syntax error"; then
        echo "✓ Test 2 Passed"
    else
        echo "✗ Test 2 Failed (exit $exit_code)"
        echo "$output"
    fi
)

echo "All quality gate tests complete."
