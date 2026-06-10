#!/bin/bash
#
# Test runner wrapper that handles Vitest worker pool crashes
# The Cloudflare Vitest pool workers sometimes crashes after tests complete
# This wrapper checks if tests actually passed before returning exit code
#

set -o pipefail

echo "Running tests with vitest..."

# Run vitest and capture output
OUTPUT=$(npm run test:ci -- "$@" 2>&1)
EXIT_CODE=$?

# Check if tests failed (including coverage threshold failures)
# Vitest returns non-zero exit code for both test failures and coverage threshold failures
if [ $EXIT_CODE -ne 0 ]; then
    # Special case: Cloudflare Vitest pool workers sometimes crash after tests complete
    # but tests themselves might have passed.
    if echo "$OUTPUT" | grep -qE "Tests.*[0-9]+ passed.*\([0-9]+\)" && \
       ! (echo "$OUTPUT" | grep -qE "[1-9][0-9]* failed") && \
       ! (echo "$OUTPUT" | grep -q "Coverage threshold for") && \
       (echo "$OUTPUT" | grep -q "Worker exited unexpectedly"); then
        echo "⚠️  Note: Vitest worker pool crashed during cleanup (non-critical, tests passed)"
    else
        echo "❌ Tests failed with exit code $EXIT_CODE"
        echo "$OUTPUT"
        exit $EXIT_CODE
    fi
fi

# If we're here, either exit code was 0 or it was a non-critical worker crash
# Still double check the output for any failures
if echo "$OUTPUT" | grep -qE "Tests.*[0-9]+ passed.*\([0-9]+\)"; then
    # Extract the test count for reporting
    TEST_COUNT=$(echo "$OUTPUT" | grep -oE "Tests.*[0-9]+ passed" | grep -oE "[0-9]+" | head -1)
    echo "✅ All $TEST_COUNT tests passed"

    # Check if there was a worker pool error (non-critical)
    if echo "$OUTPUT" | grep -q "Worker exited unexpectedly"; then
        echo "⚠️  Note: Vitest worker pool crashed during cleanup (non-critical, tests passed)"
    fi

    # Ensure we don't have failing tests hidden in the output
    if echo "$OUTPUT" | grep -q "failed"; then
       # Verify it's not just "0 failed"
       if echo "$OUTPUT" | grep -qE "[1-9][0-9]* failed"; then
           echo "❌ Some tests actually failed despite the success pattern"
           echo "$OUTPUT"
           exit 1
       fi
    fi

    # Check for coverage threshold failures in the output
    if echo "$OUTPUT" | grep -q "Coverage threshold for"; then
        echo "❌ Coverage threshold check failed"
        echo "$OUTPUT"
        exit 1
    fi

    exit 0
else
    echo "❌ Tests failed"
    echo "$OUTPUT"
    exit 1
fi
