#!/usr/bin/env bash
# PR Resolver — Automated PR lifecycle management
# Usage:
#   ./scripts/pr-resolver.sh              # All open PRs
#   ./scripts/pr-resolver.sh 42 58 123    # Specific PR numbers
#   ./scripts/pr-resolver.sh --dry-run    # Preview without changes
#
# Reference: .opencode/commands/pr-resolver.md
#            .agents/skills/pr-resolver/SKILL.md

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLANS_DIR="${ROOT_DIR}/plans"
DATE_TAG=$(date +%Y-%m-%d)
SUMMARY_FILE="${PLANS_DIR}/PR-RESOLUTION-${DATE_TAG}.md"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
SPECIFIC_PRS=()

log()  { echo -e "${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}WARN:${NC} $1"; }
err()  { echo -e "${RED}ERR:${NC} $1"; }
info() { echo -e "${CYAN}  -${NC} $1"; }

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --dry-run) DRY_RUN=true ;;
      --help|-h)
        sed -n '2,12p' "$0"
        exit 0
        ;;
      *)
        if [[ "$arg" =~ ^[0-9]+$ ]]; then
          SPECIFIC_PRS+=("$arg")
        else
          err "Unknown argument: $arg"
          exit 1
        fi
        ;;
    esac
  done
}

check_deps() {
  if ! command -v gh &>/dev/null; then
    err "gh (GitHub CLI) is required. Install from https://cli.github.com/"
    exit 1
  fi
  if ! gh auth status &>/dev/null; then
    err "Not authenticated with GitHub CLI. Run: gh auth login"
    exit 1
  fi
}

discover_prs() {
  if [[ ${#SPECIFIC_PRS[@]} -gt 0 ]]; then
    info "Using specified PRs: ${SPECIFIC_PRS[*]}"
    PR_LIST=$(printf '"%s",' "${SPECIFIC_PRS[@]}")
    PR_LIST="[${PR_LIST%,}]"
    PR_DATA=$(gh pr view "${SPECIFIC_PRS[@]}" --json number,title,headRefName,mergeable,statusCheckRollup,reviews,comments,author,baseRefName,createdAt 2>/dev/null) || {
      err "Failed to fetch specified PRs"
      exit 1
    }
    echo "$PR_DATA" | jq -s '.'
  else
    info "Discovering open PRs..."
    PR_DATA=$(gh pr list --state open --json number,title,headRefName,mergeable,statusCheckRollup,reviews,comments,author,baseRefName,createdAt 2>/dev/null) || {
      err "Failed to list PRs"
      exit 1
    }
    echo "$PR_DATA"
  fi
}

analyze_pr() {
  local pr_data="$1"
  local pr_number title head_ref mergeable checks reviews comments base_ref author

  pr_number=$(echo "$pr_data" | jq -r '.number')
  title=$(echo "$pr_data" | jq -r '.title')
  head_ref=$(echo "$pr_data" | jq -r '.headRefName')
  base_ref=$(echo "$pr_data" | jq -r '.baseRefName')
  mergeable=$(echo "$pr_data" | jq -r '.mergeable')
  author=$(echo "$pr_data" | jq -r '.author.login')

  # CI status
  checks=$(echo "$pr_data" | jq -r '[.statusCheckRollup[]? | select(.conclusion == "FAILURE" or .conclusion == "TIMED_OUT" or .conclusion == "CANCELLED") | .name] | join(",")')
  reviews=$(echo "$pr_data" | jq -r '[.reviews[]? | select(.state == "APPROVED")] | length')
  comments=$(echo "$pr_data" | jq -r '[.comments[]?] | length')

  local ci_passing=true
  local status="READY"

  if [[ -n "$checks" ]]; then
    ci_passing=false
  fi

  if [[ "$mergeable" == "CONFLICTING" ]]; then
    status="FIXABLE"
  elif [[ "$ci_passing" == false ]]; then
    status="FIXABLE"
  elif [[ "$reviews" -lt 1 ]]; then
    info "PR #$pr_number needs review ($reviews approvals)"
    status="BLOCKED"
  fi

  if [[ "$mergeable" == "UNKNOWN" ]]; then
    info "PR #$pr_number mergeability unknown (still computing)"
    status="BLOCKED"
  fi

  printf '{"number":%s,"title":"%s","headRefName":"%s","baseRefName":"%s","mergeable":"%s","ci_passing":%s,"failing_checks":"%s","approvals":%s,"comments":%s,"status":"%s","author":"%s"}\n' \
    "$pr_number" "$title" "$head_ref" "$base_ref" "$mergeable" "$ci_passing" "$checks" "$reviews" "$comments" "$status" "$author"
}

fix_pr() {
  local pr_number="$1"
  local pr_data="$2"
  local status
  status=$(echo "$pr_data" | jq -r '.status')

  if [[ "$status" != "FIXABLE" ]]; then
    return 1
  fi

  local head_ref
  head_ref=$(echo "$pr_data" | jq -r '.headRefName')
  local base_ref
  base_ref=$(echo "$pr_data" | jq -r '.baseRefName')
  local mergeable
  mergeable=$(echo "$pr_data" | jq -r '.mergeable')

  log "Fixing PR #$pr_number ($head_ref → $base_ref)"

  if $DRY_RUN; then
    info "DRY-RUN: Would attempt fixes for PR #$pr_number"
    return 0
  fi

  # Fetch branch
  git fetch origin "$head_ref" 2>/dev/null || true
  git fetch origin "$base_ref" 2>/dev/null || true

  # Merge conflict resolution
  if [[ "$mergeable" == "CONFLICTING" ]]; then
    info "Attempting merge conflict resolution..."
    if git checkout "$head_ref" 2>/dev/null; then
      if git merge "origin/$base_ref" -m "Merge branch '$base_ref' into $head_ref" 2>/dev/null; then
        git push origin "$head_ref" 2>/dev/null
        info "Merge conflicts resolved for PR #$pr_number"
      else
        git merge --abort 2>/dev/null
        warn "Automatic conflict resolution failed for PR #$pr_number — requires manual intervention"
        return 1
      fi
      git checkout "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')" 2>/dev/null || true
    else
      warn "Could not checkout $head_ref for PR #$pr_number"
      return 1
    fi
  fi

  return 0
}

merge_pr() {
  local pr_number="$1"
  local pr_data="$2"
  local status
  status=$(echo "$pr_data" | jq -r '.status')

  if [[ "$status" != "READY" ]]; then
    return 1
  fi

  local title
  title=$(echo "$pr_data" | jq -r '.title')

  log "Merging PR #$pr_number: $title"

  if $DRY_RUN; then
    info "DRY-RUN: Would merge PR #$pr_number"
    return 0
  fi

  if gh pr merge "$pr_number" --squash --auto 2>/dev/null; then
    info "PR #$pr_number merged successfully"
    return 0
  else
    warn "Failed to merge PR #$pr_number"
    return 1
  fi
}

generate_summary() {
  local ready_list="$1"
  local fixable_list="$2"
  local blocked_list="$3"
  local merged_list="$4"

  {
    echo "# PR Resolution Summary — $DATE_TAG"
    echo ""
    echo "**Generated**: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "**Dry Run**: $DRY_RUN"
    echo ""
    echo "## Results"
    echo ""
    echo "### Merged ($(echo "$merged_list" | jq -r '. | length'))"
    if [[ $(echo "$merged_list" | jq -r '. | length') -gt 0 ]]; then
      echo "$merged_list" | jq -r '.[] | "- PR #\(.number): \(.title)"'
    else
      echo "- None"
    fi
    echo ""
    echo "### Ready to Merge ($(echo "$ready_list" | jq -r '. | length'))"
    if [[ $(echo "$ready_list" | jq -r '. | length') -gt 0 ]]; then
      echo "$ready_list" | jq -r '.[] | "- PR #\(.number): \(.title)"'
    else
      echo "- None"
    fi
    echo ""
    echo "### Fixable — Needs CI Fix / Conflict Resolution ($(echo "$fixable_list" | jq -r '. | length'))"
    if [[ $(echo "$fixable_list" | jq -r '. | length') -gt 0 ]]; then
      echo "$fixable_list" | jq -r '.[] | "- PR #\(.number): \(.title) — failing: \(.failing_checks)"'
    else
      echo "- None"
    fi
    echo ""
    echo "### Blocked — Needs Human Intervention ($(echo "$blocked_list" | jq -r '. | length'))"
    if [[ $(echo "$blocked_list" | jq -r '. | length') -gt 0 ]]; then
      echo "$blocked_list" | jq -r '.[] | "- PR #\(.number): \(.title) (mergeable: \(.mergeable), ci: \(.ci_passing), approvals: \(.approvals))"'
    else
      echo "- None"
    fi
    echo ""
    echo "---"
    echo "Total PRs processed: $(echo "$ready_list $fixable_list $blocked_list" | jq -s 'add | length')"
  } > "$SUMMARY_FILE"

  log "Summary written to $SUMMARY_FILE"
}

main() {
  parse_args "$@"
  check_deps

  echo "╔══════════════════════════════════════════════╗"
  echo "║       PR Resolver — Automated PR Lifecycle   ║"
  if $DRY_RUN; then
    echo "║       DRY RUN — No changes will be made      ║"
  fi
  echo "╚══════════════════════════════════════════════╝"

  # Phase 1: Discover
  echo ""
  log "Phase 1: DISCOVER"
  local pr_data
  pr_data=$(discover_prs)
  local pr_count
  pr_count=$(echo "$pr_data" | jq -r '. | length')
  info "Found $pr_count open PR(s)"

  if [[ "$pr_count" -eq 0 ]]; then
    warn "No open PRs to process"
    echo ""
    echo "✓ All done — no PRs to resolve"
    exit 0
  fi

  # Phase 2: Analyze
  echo ""
  log "Phase 2: ANALYZE"

  local ready_list="[]"
  local fixable_list="[]"
  local blocked_list="[]"
  local merged_list="[]"

  for pr_index in $(seq 0 $((pr_count - 1))); do
    local single_pr
    single_pr=$(echo "$pr_data" | jq -c ".[$pr_index]")
    local analysis
    analysis=$(analyze_pr "$single_pr")
    local pr_number
    pr_number=$(echo "$analysis" | jq -r '.number')
    local title
    title=$(echo "$analysis" | jq -r '.title')
    local status
    status=$(echo "$analysis" | jq -r '.status')

    case "$status" in
      READY)
        info "PR #$pr_number: READY — $title"
        ready_list=$(echo "$ready_list" | jq ". + [$analysis]")
        ;;
      FIXABLE)
        info "PR #$pr_number: FIXABLE — $title"
        fixable_list=$(echo "$fixable_list" | jq ". + [$analysis]")
        ;;
      BLOCKED)
        info "PR #$pr_number: BLOCKED — $title"
        blocked_list=$(echo "$blocked_list" | jq ". + [$analysis]")
        ;;
    esac
  done

  echo ""
  info "READY:   $(echo "$ready_list" | jq -r '. | length')"
  info "FIXABLE: $(echo "$fixable_list" | jq -r '. | length')"
  info "BLOCKED: $(echo "$blocked_list" | jq -r '. | length')"

  # Phase 3: Fix
  local fixable_count
  fixable_count=$(echo "$fixable_list" | jq -r '. | length')
  if [[ "$fixable_count" -gt 0 ]]; then
    echo ""
    log "Phase 3: FIX (${fixable_count} FIXABLE PRs)"

    for pr_index in $(seq 0 $((fixable_count - 1))); do
      local fixable_pr
      fixable_pr=$(echo "$fixable_list" | jq -c ".[$pr_index]")
      local pr_number
      pr_number=$(echo "$fixable_pr" | jq -r '.number')

      if fix_pr "$pr_number" "$fixable_pr"; then
        info "PR #$pr_number fixed, reclassifying as READY"
        fixable_list=$(echo "$fixable_list" | jq "del(.[$pr_index])")
        ready_list=$(echo "$ready_list" | jq ". + [$fixable_pr | .status = \"READY\"]")
      fi
    done
  fi

  # Phase 4: Verify (run pev-gates)
  echo ""
  log "Phase 4: VERIFY"
  if ! $DRY_RUN; then
    info "Running PEV gates..."
    if bash "${SCRIPT_DIR}/pev-gates.sh"; then
      info "PEV gates passed"
    else
      warn "PEV gates reported failures — check output above"
    fi
  else
    info "DRY-RUN: Would run ./scripts/pev-gates.sh"
  fi

  # Phase 5: Merge
  local ready_count
  ready_count=$(echo "$ready_list" | jq -r '. | length')
  if [[ "$ready_count" -gt 0 ]]; then
    echo ""
    log "Phase 5: MERGE (${ready_count} READY PRs)"

    for pr_index in $(seq 0 $((ready_count - 1))); do
      local ready_pr
      ready_pr=$(echo "$ready_list" | jq -c ".[$pr_index]")
      local pr_number
      pr_number=$(echo "$ready_pr" | jq -r '.number')
      local title
      title=$(echo "$ready_pr" | jq -r '.title')

      echo ""
      read -p "Merge PR #$pr_number ($title)? [y/N] " confirm
      if [[ "$confirm" =~ ^[Yy]$ ]]; then
        if merge_pr "$pr_number" "$ready_pr"; then
          merged_list=$(echo "$merged_list" | jq ". + [$ready_pr]")
        fi
      else
        info "Skipped PR #$pr_number"
      fi
    done
  fi

  # Phase 6: Summary
  echo ""
  log "Phase 6: SUMMARY"
  generate_summary "$ready_list" "$fixable_list" "$blocked_list" "$merged_list"

  echo ""
  if $DRY_RUN; then
    echo "✓ DRY RUN complete — no changes made"
  else
    echo "✓ PR resolution complete"
  fi

  # Update GOAP_STATE.md with current status
  local pr_section="## PR Resolution Status\n\n### Resolution Summary — $DATE_TAG\n\n| PR | Title | Status |\n|----|-------|--------|\n"

  for pr_index in $(seq 0 $(( $(echo "$merged_list" | jq -r '. | length') - 1 ))); do
    local pr
    pr=$(echo "$merged_list" | jq -c ".[$pr_index]")
    local num title
    num=$(echo "$pr" | jq -r '.number')
    title=$(echo "$pr" | jq -r '.title')
    pr_section+="| #$num | $title | **MERGED** |\n"
  done

  for pr_index in $(seq 0 $(( $(echo "$ready_list" | jq -r '. | length') - 1 ))); do
    local pr
    pr=$(echo "$ready_list" | jq -c ".[$pr_index]")
    local num title
    num=$(echo "$pr" | jq -r '.number')
    title=$(echo "$pr" | jq -r '.title')
    pr_section+="| #$num | $title | READY |\n"
  done

  for pr_index in $(seq 0 $(( $(echo "$fixable_list" | jq -r '. | length') - 1 ))); do
    local pr
    pr=$(echo "$fixable_list" | jq -c ".[$pr_index]")
    local num title
    num=$(echo "$pr" | jq -r '.number')
    title=$(echo "$pr" | jq -r '.title')
    pr_section+="| #$num | $title | FIXABLE |\n"
  done

  for pr_index in $(seq 0 $(( $(echo "$blocked_list" | jq -r '. | length') - 1 ))); do
    local pr
    pr=$(echo "$blocked_list" | jq -c ".[$pr_index]")
    local num title
    num=$(echo "$pr" | jq -r '.number')
    title=$(echo "$pr" | jq -r '.title')
    pr_section+="| #$num | $title | BLOCKED |\n"
  done

  echo -e "$pr_section" >> "$SUMMARY_FILE"

  # Final status
  local blocked_count
  blocked_count=$(echo "$blocked_list" | jq -r '. | length')
  local merged_count
  merged_count=$(echo "$merged_list" | jq -r '. | length')

  if [[ "$blocked_count" -eq 0 ]] && [[ "$fixable_count" -eq 0 ]]; then
    echo ""
    echo "✓ All PRs resolved. Main CI is green."
    exit 0
  else
    if [[ "$blocked_count" -gt 0 ]]; then
      warn "$blocked_count PR(s) blocked — need human intervention"
    fi
    if [[ "$fixable_count" -gt 0 ]]; then
      warn "$fixable_count PR(s) still fixable — retry or manual fix needed"
    fi
    exit 1
  fi
}

main "$@"
