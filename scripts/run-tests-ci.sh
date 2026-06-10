#!/bin/bash
#
# Test runner wrapper that handles Vitest worker pool crashes
#

set -o pipefail

echo "Running tests with vitest..."

# Create a temporary file for output
TMP_OUTPUT=$(mktemp)

# Run vitest, stream to console and capture to file
# We use "npm run test:ci -- $@" to pass through any extra arguments like --coverage
npm run test:ci -- "$@" 2>&1 | tee "$TMP_OUTPUT"
EXIT_CODE=$?

OUTPUT=$(cat "$TMP_OUTPUT")
rm "$TMP_OUTPUT"

# Check if tests failed (including coverage threshold failures)
if [ $EXIT_CODE -ne 0 ]; then
    # Special case: Cloudflare Vitest pool workers sometimes crash after tests complete
    if echo "$OUTPUT" | grep -qE "Tests.*[0-9]+ passed.*\([0-9]+\)" && \
       ! (echo "$OUTPUT" | grep -qE "[1-9][0-9]* failed") && \
       ! (echo "$OUTPUT" | grep -q "Coverage threshold for") && \
       (echo "$OUTPUT" | grep -q "Worker exited unexpectedly"); then
        echo "⚠️ Note: Vitest worker pool crashed during cleanup (non-critical, tests passed)"
        exit 0
    else
        echo "❌ Tests failed with exit code $EXIT_CODE"
        exit $EXIT_CODE
    fi
fi

# Double check the output for any failures
if echo "$OUTPUT" | grep -qE "Tests.*[0-9]+ passed.*\([0-9]+\)"; then
    TEST_COUNT=$(echo "$OUTPUT" | grep -oE "Tests.*[0-9]+ passed" | grep -oE "[0-9]+" | head -1)
    echo "✅ All $TEST_COUNT tests passed"
    exit 0
else
    echo "❌ Tests output did not match expected success pattern"
    exit 1
fi
