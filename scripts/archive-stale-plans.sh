#!/usr/bin/env bash
# Archive Stale Progress Updates
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../" && pwd)"
PLANS_DIR="$REPO_ROOT/plans"
ARCHIVE_DIR="$PLANS_DIR/archive"
MOVED_COUNT=0
NOW_SECONDS=$(date +%s)
SIXTY_DAYS_SECONDS=$((60 * 24 * 60 * 60))
CUTOFF_DATE=$(date -d "@$((NOW_SECONDS - SIXTY_DAYS_SECONDS))" +%Y-%m-%d 2>/dev/null || date -v-60d +%Y-%m-%d)

if [[ ! -d "$ARCHIVE_DIR" ]]; then
    exit 0
fi

files_to_move=()
while IFS= read -r -d '' file; do
  filename="${file##*/}"
  if [[ "$filename" =~ -progress-update-([0-9]{4}-[0-9]{2}-[0-9]{2})\.md$ ]]; then
    file_date="${BASH_REMATCH[1]}"
    if [[ "$file_date" < "$CUTOFF_DATE" ]]; then
      if [[ ! -f "$ARCHIVE_DIR/$filename" ]]; then
        files_to_move+=("$file")
      fi
    fi
  fi
done < <(find "$PLANS_DIR" -maxdepth 1 -name '*-progress-update-*.md' -print0)

if [[ ${#files_to_move[@]} -gt 0 ]]; then
  mv -n -- "${files_to_move[@]}" "$ARCHIVE_DIR/"
  MOVED_COUNT=${#files_to_move[@]}
fi

if [[ $MOVED_COUNT -gt 0 ]]; then
  echo "Archived $MOVED_COUNT stale plan(s)."
fi
