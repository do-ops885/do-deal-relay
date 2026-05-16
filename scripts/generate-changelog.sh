#!/usr/bin/env bash
# Generate CHANGELOG entries from conventional commits
# Usage:
#   ./scripts/generate-changelog.sh <from-ref> [to-ref]
#   ./scripts/generate-changelog.sh --between <tag1> <tag2>
#   ./scripts/generate-changelog.sh --unreleased
#   ./scripts/generate-changelog.sh --last-release
#
# Output: Markdown formatted for Keep a Changelog

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# --- Help ---
usage() {
    cat <<EOF
Usage: $(basename "$0") [options] [from-ref] [to-ref]

Extract conventional commits and format as Keep a Changelog entries.

Options:
  -b, --between <tag1> <tag2>   Generate entries between two tags
  -u, --unreleased              Generate entry from last tag to HEAD
  -l, --last-release            Generate full entry for the latest tag
  -h, --help                    Show this help
EOF
    exit 0
}

# --- Parse arguments ---
MODE="range"
FROM_REF=""
TO_REF=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) usage ;;
        -b|--between)
            MODE="range"
            FROM_REF="$2"
            TO_REF="$3"
            shift 3
            ;;
        -u|--unreleased)
            MODE="unreleased"
            shift
            ;;
        -l|--last-release)
            MODE="last-release"
            shift
            ;;
        *)
            if [ -z "$FROM_REF" ]; then
                FROM_REF="$1"
            elif [ -z "$TO_REF" ]; then
                TO_REF="$1"
            fi
            shift
            ;;
    esac
done

# --- Resolve refs ---
HEADER_TAG=""

case "$MODE" in
    unreleased)
        FROM_REF=$(git tag --sort=-v:refname | head -1 2>/dev/null || echo "")
        if [ -z "$FROM_REF" ]; then
            FROM_REF=$(git rev-list --max-parents=0 HEAD 2>/dev/null)
        fi
        TO_REF="HEAD"
        HEADER_TAG="Unreleased"
        echo "[INFO] Unreleased changes since ${FROM_REF}" >&2
        ;;
    last-release)
        LATEST_TAG=$(git tag --sort=-v:refname | head -1 2>/dev/null || echo "")
        if [ -z "$LATEST_TAG" ]; then
            echo "[ERROR] No tags found" >&2
            exit 1
        fi
        PREV_TAG=$(git tag --sort=-v:refname | head -2 | tail -1 2>/dev/null || echo "")
        if [ -z "$PREV_TAG" ]; then
            PREV_TAG=$(git rev-list --max-parents=0 HEAD 2>/dev/null)
        fi
        FROM_REF="$PREV_TAG"
        TO_REF="$LATEST_TAG"
        HEADER_TAG="$LATEST_TAG"
        echo "[INFO] Last release: ${LATEST_TAG} (since ${PREV_TAG})" >&2
        ;;
    range)
        if [ -z "$FROM_REF" ]; then
            echo "[ERROR] Missing from-ref" >&2
            exit 1
        fi
        if [ -z "$TO_REF" ]; then
            TO_REF="HEAD"
        fi
        HEADER_TAG="$TO_REF"
        echo "[INFO] Changes from ${FROM_REF} to ${TO_REF}" >&2
        ;;
esac

# --- Collect commits ---
# Use flat files to avoid bash array complexity
ADDED=$(mktemp)
FIXED=$(mktemp)
CHANGED=$(mktemp)
PERFORMANCE=$(mktemp)
SECURITY=$(mktemp)
DOCS=$(mktemp)
TESTING=$(mktemp)
MAINTENANCE=$(mktemp)
trap 'rm -f "$ADDED" "$FIXED" "$CHANGED" "$PERFORMANCE" "$SECURITY" "$DOCS" "$TESTING" "$MAINTENANCE"' EXIT

# Map conventional commit types to sections
map_type_to_section() {
    local type="$1"
    case "$type" in
        feat|feature)           echo "added" ;;
        fix|bugfix|hotfix|revert) echo "fixed" ;;
        refactor|style)         echo "changed" ;;
        perf|performance)       echo "performance" ;;
        security)               echo "security" ;;
        docs|doc)               echo "docs" ;;
        test|tests)             echo "testing" ;;
        chore|build|ci|release) echo "maintenance" ;;
        *)                      echo "" ;;
    esac
}

TOTAL=0

while IFS="|" read -r HASH SUBJECT BODY; do
    # Parse: type(scope): description  OR  type: description
    TYPE=""
    SCOPE=""
    DESCRIPTION=""
    
    scope_re='^([a-zA-Z]+)\(([^)]+)\):[[:space:]]*(.*)'
    simple_re='^([a-zA-Z]+):[[:space:]]*(.*)'
    
    if [[ "$SUBJECT" =~ $scope_re ]]; then
        TYPE="${BASH_REMATCH[1]}"
        SCOPE="${BASH_REMATCH[2]}"
        DESCRIPTION="${BASH_REMATCH[3]}"
    elif [[ "$SUBJECT" =~ $simple_re ]]; then
        TYPE="${BASH_REMATCH[1]}"
        DESCRIPTION="${BASH_REMATCH[2]}"
    else
        continue
    fi

    # Skip merge commits
    if [[ "$TYPE" == "merge" || "$TYPE" == "Merge" ]]; then
        continue
    fi

    # Build line
    SHORT_HASH="${HASH:0:7}"
    GITHUB_URL="https://github.com/do-ops885/do-deal-relay/commit/${HASH}"
    
    LINE="${DESCRIPTION}"
    if [ -n "$SCOPE" ]; then
        LINE="${LINE} (\`${SCOPE}\`)" 
    fi
    LINE="${LINE} ([${SHORT_HASH}](${GITHUB_URL}))"

    # Check body for breaking changes
    if echo "$BODY" | grep -qi "BREAKING CHANGE\|!:"; then
        LINE="BREAKING: ${LINE}"
    fi

    # Categorize
    SECTION=$(map_type_to_section "$TYPE")
    case "$SECTION" in
        added)       echo "$LINE" >> "$ADDED";       TOTAL=$((TOTAL + 1)) ;;
        fixed)       echo "$LINE" >> "$FIXED";       TOTAL=$((TOTAL + 1)) ;;
        changed)     echo "$LINE" >> "$CHANGED";     TOTAL=$((TOTAL + 1)) ;;
        performance) echo "$LINE" >> "$PERFORMANCE"; TOTAL=$((TOTAL + 1)) ;;
        docs)        echo "$LINE" >> "$DOCS";        TOTAL=$((TOTAL + 1)) ;;
        testing)     echo "$LINE" >> "$TESTING";     TOTAL=$((TOTAL + 1)) ;;
        maintenance) echo "$LINE" >> "$MAINTENANCE"; TOTAL=$((TOTAL + 1)) ;;
    esac

    # Also add to security section if body mentions security
    if echo "$BODY" | grep -qi "security\|CVE-\|vuln"; then
        echo "$LINE" >> "$SECURITY"
    fi
done < <(git log --format="%H|%s|%b" "${FROM_REF}..${TO_REF}" 2>/dev/null || echo "")

# --- Output ---
print_section() {
    local title="$1"
    local file="$2"
    
    if [ ! -s "$file" ]; then
        return
    fi
    
    echo "### ${title}"
    echo ""
    while IFS= read -r line; do
        if [ -n "$line" ]; then
            echo "- ${line}"
        fi
    done < "$file"
    echo ""
}

if [ "$TOTAL" -eq 0 ]; then
    echo "No conventional commits found in range ${FROM_REF}..${TO_REF}"
    echo ""
    echo "Tip: Commit messages should follow the format:"
    echo "  type(scope): description"
    echo "  feat: new feature"
    echo "  fix(api): fix bug in API handler"
    echo "  perf(dedupe): improve dedupe throughput"
    exit 0
fi

echo "## [${HEADER_TAG}] - $(date +%Y-%m-%d)"
echo ""
echo "### Summary"
echo "- **${TOTAL}** changes in this release"
echo ""

print_section "Added" "$ADDED"
print_section "Fixed" "$FIXED"
print_section "Changed" "$CHANGED"
print_section "Performance" "$PERFORMANCE"
print_section "Security" "$SECURITY"
print_section "Documentation" "$DOCS"
print_section "Testing" "$TESTING"
print_section "Maintenance" "$MAINTENANCE"

echo "---"
echo ""
echo "_Generated by \`scripts/generate-changelog.sh\`_"
