#!/usr/bin/env bash
# tests/unit/worker-host.test.sh
#
# Shell unit tests for scripts/worker-host.sh
# Run with: bash tests/unit/worker-host.test.sh
#
# Exits 0 on success, 1 on first failure.
#
# These tests use `env -i PATH="$PATH"` to isolate the test environment, so
# only the explicitly-passed env vars are visible to the script. This matches
# the behavior of GitHub Actions where only declared env vars are present.

set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/worker-host.sh"
if [ ! -x "$SCRIPT" ]; then
    echo "❌ Script not found or not executable: $SCRIPT" >&2
    exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=()

assert_eq() {
    local desc="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then
        PASS=$((PASS + 1))
        printf '  \033[32m✓\033[0m %s\n' "$desc"
    else
        FAIL=$((FAIL + 1))
        FAILED_TESTS+=("$desc")
        printf '  \033[31m✗\033[0m %s\n' "$desc"
        printf '      expected: %q\n' "$expected"
        printf '      actual:   %q\n' "$actual"
    fi
}

assert_exit() {
    local desc="$1" expected_code="$2" actual_code="$3"
    if [ "$expected_code" = "$actual_code" ]; then
        PASS=$((PASS + 1))
        printf '  \033[32m✓\033[0m %s\n' "$desc"
    else
        FAIL=$((FAIL + 1))
        FAILED_TESTS+=("$desc")
        printf '  \033[31m✗\033[0m %s\n' "$desc"
        printf '      expected exit: %s\n' "$expected_code"
        printf '      actual exit:   %s\n' "$actual_code"
    fi
}

# run_capture <env_assignments...> -- <args...>  -> sets $LAST_STDOUT and $LAST_EXIT
run_capture() {
    local env_args=()
    local script_args=()
    local seen_sep=0
    for arg in "$@"; do
        if [ "$arg" = "--" ]; then
            seen_sep=1
            continue
        fi
        if [ "$seen_sep" -eq 0 ]; then
            env_args+=("$arg")
        else
            script_args+=("$arg")
        fi
    done
    LAST_STDOUT=$(env -i PATH="$PATH" "${env_args[@]}" bash "$SCRIPT" "${script_args[@]}" 2>/dev/null)
    LAST_EXIT=$?
}

echo "▶ scripts/worker-host.sh — single WORKER_HOST (GitHub Environments pattern)"
FAILED_TESTS_LAST_DESC="WORKER_HOST resolves for production"
run_capture WORKER_HOST=do-deal-relay.do-it-119.workers.dev -- production
assert_eq "$FAILED_TESTS_LAST_DESC" "do-deal-relay.do-it-119.workers.dev" "$LAST_STDOUT"
assert_exit "$FAILED_TESTS_LAST_DESC" "0" "$LAST_EXIT"

FAILED_TESTS_LAST_DESC="WORKER_HOST resolves for staging (env-scoped via GH Env)"
run_capture WORKER_HOST=do-deal-relay-staging.do-it-119.workers.dev -- staging
assert_eq "$FAILED_TESTS_LAST_DESC" "do-deal-relay-staging.do-it-119.workers.dev" "$LAST_STDOUT"

FAILED_TESTS_LAST_DESC="WORKER_HOST resolves for dev"
run_capture WORKER_HOST=do-deal-relay-dev.example.com -- dev
assert_eq "$FAILED_TESTS_LAST_DESC" "do-deal-relay-dev.example.com" "$LAST_STDOUT"

echo "▶ scripts/worker-host.sh — override arg"
FAILED_TESTS_LAST_DESC="override arg wins over WORKER_HOST"
run_capture WORKER_HOST=fallback -- production custom.override.com
assert_eq "$FAILED_TESTS_LAST_DESC" "custom.override.com" "$LAST_STDOUT"

FAILED_TESTS_LAST_DESC="override arg wins for staging"
run_capture WORKER_HOST=fallback -- staging custom-stg.override.com
assert_eq "$FAILED_TESTS_LAST_DESC" "custom-stg.override.com" "$LAST_STDOUT"

echo "▶ scripts/worker-host.sh — scheme stripping"
FAILED_TESTS_LAST_DESC="strips https://"
run_capture WORKER_HOST=https://do-deal-relay.do-it-119.workers.dev -- production
assert_eq "$FAILED_TESTS_LAST_DESC" "do-deal-relay.do-it-119.workers.dev" "$LAST_STDOUT"

FAILED_TESTS_LAST_DESC="strips http://"
run_capture WORKER_HOST=http://example.com -- production
assert_eq "$FAILED_TESTS_LAST_DESC" "example.com" "$LAST_STDOUT"

echo "▶ scripts/worker-host.sh — legacy aliases"
FAILED_TESTS_LAST_DESC="CLOUDFLARE_WORKER_HOST works as legacy alias"
run_capture CLOUDFLARE_WORKER_HOST=legacy.example.com -- production
assert_eq "$FAILED_TESTS_LAST_DESC" "legacy.example.com" "$LAST_STDOUT"

FAILED_TESTS_LAST_DESC="WORKER_HOST_OVERRIDE works as ad-hoc override"
run_capture WORKER_HOST_OVERRIDE=override.example.com -- production
assert_eq "$FAILED_TESTS_LAST_DESC" "override.example.com" "$LAST_STDOUT"

echo "▶ scripts/worker-host.sh — error cases"
FAILED_TESTS_LAST_DESC="missing all vars -> exit 2"
run_capture -- production
assert_exit "$FAILED_TESTS_LAST_DESC" "2" "$LAST_EXIT"

FAILED_TESTS_LAST_DESC="invalid env -> exit 1"
run_capture WORKER_HOST=foo -- bogus
assert_exit "$FAILED_TESTS_LAST_DESC" "1" "$LAST_EXIT"

FAILED_TESTS_LAST_DESC="no args -> exits 1 (usage)"
run_capture
assert_exit "$FAILED_TESTS_LAST_DESC" "1" "$LAST_EXIT"

echo
echo "─────────────────────────────"
printf 'PASS: %d   FAIL: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
    echo "Failed tests:"
    for t in "${FAILED_TESTS[@]}"; do
        echo "  - $t"
    done
    exit 1
fi
echo "✅ All worker-host.sh tests passed"
exit 0
