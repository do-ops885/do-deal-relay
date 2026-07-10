#!/usr/bin/env bash
# ci-workflow-validator.sh - Validate that wrangler.jsonc env vars & secrets
#                            flow into the correct GitHub Actions workflows.
#
# Companion sensor for the "Config Contract Changes" rule in
# agents-docs/accuracy-guardrails.md:
#   When you change validateConfig() in worker/config.ts or add a var/secret to
#   wrangler.jsonc, you MUST inject it in the right .github/workflows/*.yml file.
#
# Algorithm:
#   1. Parse wrangler.jsonc via node eval() (works perfectly for JSONC since
#      comments and trailing commas are valid JS object-literal syntax).
#   2. For each var/secret, check it is referenced under `env.X` (vars) or
#      `secrets.X` (secrets) in at least one expected workflow file.
#   3. If env-specific (.env.production.*), it MUST appear in the production
#      deploy workflows (deploy-production.yml or canary.yml).
#   4. Secrets referenced via env.X (instead of secrets.X) FAIL with a hint.
#
# Usage:
#   ./scripts/ci-workflow-validator.sh
#   ./scripts/ci-workflow-validator.sh --verbose
#   ./scripts/ci-workflow-validator.sh --json

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WRANGLER="${PROJECT_ROOT}/wrangler.jsonc"
WORKFLOWS_DIR="${PROJECT_ROOT}/.github/workflows"

VERBOSE=false
JSON=false
PASSES=0; FAILS=0; WARNS=0
MISSING_ITEMS=()

# Color codes
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

# Parse args
for arg in "$@"; do
  case "$arg" in
    --verbose|-v) VERBOSE=true ;;
    --json) JSON=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# JSON FD redirection
if $JSON; then exec 3>&1; exec 1>&2; fi

# Logging
info()  { $JSON || echo -e "$@" >&2; }
pass()  { $VERBOSE || $JSON || echo -e "  ${GREEN}✓${NC} $1"; : $((PASSES++)); }
warn()  { $JSON || echo -e "  ${YELLOW}!${NC} $1"; : $((WARNS++)); }
fail()  { $JSON || echo -e "  ${RED}✗${NC} $1"; : $((FAILS++)); }

# ── Pre-flight ──────────────────────────────────────────────────────
[[ -f "$WRANGLER" ]]       || { info "${RED}MISSING: $WRANGLER${NC}"; exit 2; }
[[ -d "$WORKFLOWS_DIR" ]]  || { info "${RED}MISSING: $WORKFLOWS_DIR${NC}"; exit 2; }
command -v node >/dev/null || { info "${RED}MISSING: node (required for JSONC parser)${NC}"; exit 2; }
command -v jq   >/dev/null || { info "${RED}MISSING: jq (required)${NC}"; exit 2; }

# ── Phase 1: JSONC → JSON via node eval() ──────────────────────────
# This is robust because JSONC is just valid JS object-literal syntax,
# so eval() handles // and /* */ comments + trailing commas natively.
WR_JSON=$(node -e '
  const fs = require("fs");
  const src = fs.readFileSync(process.argv[1], "utf8");
  process.stdout.write(JSON.stringify(eval("(" + src + ")")));
' "$WRANGLER" 2>/dev/null) || { info "${RED}Failed to parse $WRANGLER as JSONC${NC}"; exit 2; }

# ── Phase 2: Build item list ───────────────────────────────────────
# Each item: TYPE:LEVEL:NAME (TYPE ∈ var|secret, LEVEL ∈ top-level|production|staging|dev)
# Two-step approach: top-level items first, then per-env items via a separate jq call.
# This avoids brittle compound expression edge cases inside bash strings.
TOP_LEVEL_ITEMS=$(echo "$WR_JSON" | jq -r '
  ((.vars // {}) | keys[] | "var:top-level:\(.)"),
  (((.secrets // {}).required // [])[] | "secret:top-level:\(.)")
' 2>/dev/null)

ENV_ITEMS=$(echo "$WR_JSON" | jq -r '
  .env // {} | keys[] as $lvl |
  (
    (.env[$lvl].vars // {}) | keys[] | "var:\($lvl):\(.)"
  ),
  (
    (.env[$lvl].secrets // {} | .required // [] | .[]) | "secret:\($lvl):\(.)"
  )
' 2>/dev/null)

ITEMS=$(printf '%s\n%s\n' "$TOP_LEVEL_ITEMS" "$ENV_ITEMS" | grep -v '^$' || true)

[[ -z "$ITEMS" ]] && { info "${YELLOW}wrangler.jsonc has no vars/secrets to validate${NC}"; exit 0; }

# ── Phase 3: Per-item validation ───────────────────────────────────
# Expected workflow files per environment (regex against .github/workflows/X.yml)
declare -A EXPECTED_RE
EXPECTED_RE[top-level]='.*\.yml$'
EXPECTED_RE[production]='(deploy-production\.yml|canary\.yml|nightly\.yml)$'
EXPECTED_RE[staging]='deploy-staging\.yml$'
EXPECTED_RE[dev]='deploy-dev\.yml$'

# Concatenate all workflow YAMLs with comments stripped
# (so a var mentioned only in a comment doesn't count as usage)
WORKFLOW_TEXT=$(awk '!/^[[:space:]]*#/' "$WORKFLOWS_DIR"/*.yml 2>/dev/null || true)

info "\n${CYAN}=== CI WORKFLOW VALIDATOR ===${NC}\n"
total=$(echo "$ITEMS" | wc -l | tr -d ' ')
info "${CYAN}Checking $total config items across $(ls "$WORKFLOWS_DIR"/*.yml | wc -l | tr -d ' ') workflows${NC}\n"

while IFS= read -r item; do
  [[ -z "$item" ]] && continue
  type="${item%%:*}"
  rest="${item#*:}"
  level="${rest%%:*}"
  name="${rest#*:}"

  if [[ "$type" == "secret" ]]; then
    expected_term="secrets.${name}"
    forbidden_term="env.${name}"
  else
    expected_term="env.${name}"
    forbidden_term=""
  fi

  # Find workflow files containing the expected reference
  found_in=$(grep -lE "${expected_term}" "$WORKFLOWS_DIR"/*.yml 2>/dev/null || true)
  found_in_basenames=$(echo "$found_in" | xargs -n1 basename 2>/dev/null | sort -u | paste -sd, -)

  # Secret referenced via env.X (the wrong form)
  if [[ -n "$forbidden_term" ]] && echo "$WORKFLOW_TEXT" | grep -qE "${forbidden_term}"; then
    fail "${name} (secret) referenced via ${forbidden_term} — must use ${expected_term}"
    MISSING_ITEMS+=("$name|$level|secret|wrong_form_env")
    continue
  fi

  if [[ -z "$found_in" ]]; then
    if [[ "$level" == "staging" || "$level" == "dev" ]]; then
      warn "${name} (${type}, ${level}): no workflow usage — staging/dev deploy may not exist yet"
    else
      fail "${name} (${type}, ${level}): expected ${expected_term}, found in no workflow"
      MISSING_ITEMS+=("$name|$level|$type|absent")
    fi
    continue
  fi

  # If level-specific, verify expected-workflow file match
  if [[ "$level" != "top-level" ]]; then
    regex="${EXPECTED_RE[$level]:-.*\.yml$}"
    if ! echo "$found_in_basenames" | grep -qE "$regex"; then
      fail "${name} (${level}): found only in wrong workflows: ${found_in_basenames}; expected ${regex}"
      MISSING_ITEMS+=("$name|$level|$type|wrong_workflow")
    else
      pass "${name} (${type}, ${level}) → $(echo "$found_in_basenames" | tr '\n' ',')"
    fi
  else
    pass "${name} (${type}, top-level) → $(echo "$found_in_basenames" | tr '\n' ',')"
  fi
done <<< "$ITEMS"

# ── Phase 4: Summary ───────────────────────────────────────────────
$JSON || info "\n${CYAN}=== SUMMARY ===${NC}"
$JSON || info "  Passed:   ${GREEN}${PASSES}${NC}"
$JSON || info "  Warnings: ${YELLOW}${WARNS}${NC}"
$JSON || info "  Failures: ${RED}${FAILS}${NC}"

# JSON output
if $JSON; then
  exec 1>&3
  printf '{\n'
  printf '  "totals": { "passes": %d, "warnings": %d, "failures": %d },\n' "$PASSES" "$WARNS" "$FAILS"
  printf '  "missing_items": [\n'
  first=true
  for m in "${MISSING_ITEMS[@]}"; do
    IFS='|' read -r n lv ty reason <<< "$m"
    $first || printf ',\n'
    first=false
    printf '    { "name": "%s", "level": "%s", "type": "%s", "reason": "%s" }' "$n" "$lv" "$ty" "$reason"
  done
  printf '\n  ]\n}\n'
fi

# Exit code
if (( FAILS > 0 )); then exit 2; fi
if (( WARNS > 0 )); then exit 1; fi
exit 0
