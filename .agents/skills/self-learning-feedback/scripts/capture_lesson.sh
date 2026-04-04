#!/usr/bin/env bash
#
# capture_lesson.sh - SOCRATES Module
# Capture errors and fixes for institutional learning
#

set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default values
ERROR_TYPE=""
CONTEXT=""
EVIDENCE=""
FIX=""
PREVENTION=""
DRY_RUN=false

usage() {
    echo "Usage: $0 --error-type TYPE --context DESC --evidence PROOF --fix SOLUTION [options]"
    echo ""
    echo "Required:"
    echo "  --error-type    Type of error (e.g., version_mismatch)"
    echo "  --context       Where/what the error occurred"
    echo "  --evidence      Proof of the error"
    echo "  --fix           How it was fixed"
    echo ""
    echo "Optional:"
    echo "  --prevention    How to prevent in future"
    echo "  --dry-run       Preview without saving"
    echo ""
    echo "Example:"
    echo "  $0 --error-type version_mismatch \\"
    echo "     --context \"Referral system claims v1.0.0\" \\"
    echo "     --evidence \"VERSION file shows 0.1.1\" \\"
    echo "     --fix \"Updated frontmatter to 0.1.1\" \\"
    echo "     --prevention \"Add version check to template\""
    exit 1
}

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --error-type) ERROR_TYPE="$2"; shift ;;
        --context) CONTEXT="$2"; shift ;;
        --evidence) EVIDENCE="$2"; shift ;;
        --fix) FIX="$2"; shift ;;
        --prevention) PREVENTION="$2"; shift ;;
        --dry-run) DRY_RUN=true ;;
        --help) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
    shift
done

# Validate required
[[ -z "$ERROR_TYPE" ]] && echo "Error: --error-type required" && usage
[[ -z "$CONTEXT" ]] && echo "Error: --context required" && usage
[[ -z "$EVIDENCE" ]] && echo "Error: --evidence required" && usage
[[ -z "$FIX" ]] && echo "Error: --fix required" && usage

# Generate lesson ID
LESSON_ID="LESSON-$(date +%s)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build lesson JSON
LESSON_JSON=$(cat <<EOF
{
  "lesson_id": "$LESSON_ID",
  "timestamp": "$TIMESTAMP",
  "error_type": "$ERROR_TYPE",
  "severity": "HIGH",
  "context": "$CONTEXT",
  "evidence": {
    "description": "$EVIDENCE"
  },
  "fix_applied": "$FIX",
  "prevention": {
    "immediate": "$PREVENTION",
    "long_term": "Add to CI verification"
  },
  "tags": ["$ERROR_TYPE"],
  "confidence": "HIGH"
}
EOF
)

# Output
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}DRY RUN - Would capture lesson:${NC}"
    echo "$LESSON_JSON" | python3 -m json.tool 2>/dev/null || echo "$LESSON_JSON"
else
    # Save to lessons.jsonl (append mode)
    LESSONS_FILE="agents-docs/lessons.jsonl"

    # Ensure directory exists
    mkdir -p "$(dirname "$LESSONS_FILE")"

    # Append lesson
    echo "$LESSON_JSON" >> "$LESSONS_FILE"

    echo -e "${GREEN}✓ Lesson captured:${NC} $LESSON_ID"
    echo -e "${BLUE}  Saved to:${NC} $LESSONS_FILE"
    echo ""
    echo "Summary:"
    echo "  Error type: $ERROR_TYPE"
    echo "  Fix: $FIX"
    [[ -n "$PREVENTION" ]] && echo "  Prevention: $PREVENTION"
fi
