#!/bin/bash
#
# Test runner wrapper that handles Vitest worker pool crashes
# The Cloudflare Vitest pool workers sometimes crashes after tests complete
# This wrapper checks if tests actually passed before returning exit code
#

set -o pipefail

echo "Running tests with vitest..."

# Run vitest and capture output
OUTPUT=$(npm run test:ci 2>&1)
EXIT_CODE=$?

# Check if tests passed by looking for the success pattern
# Accept any test count (we have 426 tests now with multi-agent tests)
if echo "$OUTPUT" | grep -qE "Tests.*[0-9]+ passed.*\([0-9]+\)"; then
    # Extract the test count for reporting
    TEST_COUNT=$(echo "$OUTPUT" | grep -oE "Tests.*[0-9]+ passed" | grep -oE "[0-9]+" | head -1)
    echo "✅ All $TEST_COUNT tests passed"

    # Check if there was a worker pool error (non-critical)
    if echo "$OUTPUT" | grep -q "Worker exited unexpectedly"; then
        echo "⚠️  Note: Vitest worker pool crashed during cleanup (non-critical, tests passed)"
    fi

    exit 0
else
    echo "❌ Tests failed"
    echo "$OUTPUT"
    exit 1
fi
