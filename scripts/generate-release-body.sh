#!/bin/bash
# Generate release body markdown
# Usage: ./scripts/generate-release-body.sh <tag> <repo>
set -e

TAG="$1"
REPO="$2"

cat << EOF
## Changes

$(git log --format="- %s (%h)" "$(git tag --sort=-v:refname | grep -v "$TAG" | head -1)".."$TAG" 2>/dev/null || echo "- Initial release")

## Installation

\`\`\`bash
git clone https://github.com/${REPO}.git
cd do-deal-relay
git checkout ${TAG}
npm install
\`\`\`

## Deploy

\`\`\`bash
npm run build
npm run deploy
\`\`\`
EOF
