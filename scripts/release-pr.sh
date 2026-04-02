#!/bin/bash
# Enhanced release workflow with PR automation
# Usage: ./scripts/release-pr.sh [version]

set -e

echo "=== Release Workflow with PR Automation ==="
echo ""

# Get current version
CURRENT_VERSION=$(cat VERSION)
echo "Current version: $CURRENT_VERSION"

# Parse current version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate suggested patch version
SUGGESTED_PATCH="$MAJOR.$MINOR.$((PATCH + 1))"

# Ask for version
echo ""
echo "Version options:"
echo "  - Patch (default): $SUGGESTED_PATCH - bug fixes only"
echo "  - Enter manually: x.y.z format"
echo ""
read -p "Enter new version [$SUGGESTED_PATCH]: " NEW_VERSION

# Use default if empty
if [ -z "$NEW_VERSION" ]; then
    NEW_VERSION="$SUGGESTED_PATCH"
fi

# Validate version format
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Invalid version format: $NEW_VERSION"
    exit 1
fi

echo ""
echo "Releasing version: $NEW_VERSION"
read -p "Continue? [y/N]: " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
fi

# Create release branch
BRANCH_NAME="release/v$NEW_VERSION"
git checkout -b "$BRANCH_NAME"
echo "✓ Created branch: $BRANCH_NAME"

# Update VERSION file
echo "$NEW_VERSION" > VERSION
echo "✓ Updated VERSION"

# Update package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "✓ Updated package.json"

# Update package-lock.json
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package-lock.json 2>/dev/null || true
echo "✓ Updated package-lock.json"

# Update worker/config.ts
sed -i "s/VERSION: \".*\"/VERSION: \"$NEW_VERSION\"/" worker/config.ts
sed -i "s/SCHEMA_VERSION: \".*\"/SCHEMA_VERSION: \"$NEW_VERSION\"/" worker/config.ts
echo "✓ Updated worker/config.ts"

# Update README.md version badge
sed -i "s/Version.*:.*[0-9]\+\.[0-9]\+\.[0-9]\+/Version: $NEW_VERSION/" README.md
echo "✓ Updated README.md"

# Update AGENTS.md
sed -i "s/\\*\\*Version\\*\\*: [0-9]\+\.[0-9]\+\.[0-9]\+/\\*\\*Version\\*\\*: $NEW_VERSION/" AGENTS.md
echo "✓ Updated AGENTS.md"

# Update test files
find tests -name "*.ts" -exec sed -i "s/version: \"[^\"]*\"/version: \"$NEW_VERSION\"/g" {} \;
find tests -name "*.ts" -exec sed -i "s/schema_version: \"[^\"]*\"/schema_version: \"$NEW_VERSION\"/g" {} \;
echo "✓ Updated test files"

# Update public/deals.json
if [ -f public/deals.json ]; then
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" public/deals.json
    sed -i "s/\"schema_version\": \"[^\"]*\"/\"schema_version\": \"$NEW_VERSION\"/" public/deals.json
    echo "✓ Updated public/deals.json"
fi

# Update docs/API.md examples
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/g" docs/API.md
echo "✓ Updated docs/API.md"

# Update all documentation files
for file in AGENTS.md docs/AGENTS.md agents-docs/SYSTEM_REFERENCE.md QUICKSTART.md agents-docs/PROJECT_STRUCTURE.md agents-docs/features/*.md agents-docs/coordination/*.md; do
    if [ -f "$file" ]; then
        sed -i "s/\\*\\*Version\\*\\*: [0-9]\+\.[0-9]\+\.[0-9]\+/\\*\\*Version\\*\\*: $NEW_VERSION/g" "$file" 2>/dev/null || true
        sed -i "s/\\*\\*Version:[0-9]\+\.[0-9]\+\.[0-9]\+/\\*\\*Version: $NEW_VERSION/g" "$file" 2>/dev/null || true
        sed -i "s/version: [0-9]\+\.[0-9]\+\.[0-9]\+/version: $NEW_VERSION/g" "$file" 2>/dev/null || true
    fi
done
echo "✓ Updated all documentation"

# Run quality gates
echo ""
echo "Running quality gates..."
if ! ./scripts/quality_gate.sh; then
    echo "❌ Quality gates failed. Fix issues before releasing."
    exit 1
fi

# Run tests
echo ""
echo "Running tests..."
if ! npm run test:ci; then
    echo "❌ Tests failed. Fix issues before releasing."
    exit 1
fi

# Stage all changes
git add -A
echo "✓ Staged all changes"

# Atomic commit
git commit -m "release: version $NEW_VERSION

- VERSION: $CURRENT_VERSION → $NEW_VERSION
- package.json: updated version field
- package-lock.json: synchronized with package.json
- worker/config.ts: VERSION and SCHEMA_VERSION constants
- README.md: version badge updated
- AGENTS.md: version header updated
- All documentation files: version synchronized
- Test files: version and schema_version updated"

echo "✓ Atomic commit created"

# Push branch
git push -u origin "$BRANCH_NAME"
echo "✓ Pushed branch to origin"

# Create PR with automerge
echo ""
echo "Creating Pull Request..."
PR_URL=$(gh pr create \
    --title "Release v$NEW_VERSION" \
    --body "## Release v$NEW_VERSION

### Version Updates
- VERSION: $CURRENT_VERSION → $NEW_VERSION
- All documentation synchronized
- All test fixtures updated

### Verification
- [x] Quality gates passed
- [x] All tests passing
- [x] TypeScript compilation successful
- [x] No secrets detected

### Changes
$(git diff --stat HEAD~1 | tail -1)

Ready for review and merge." \
    --base main \
    --head "$BRANCH_NAME")

echo "✓ Created PR: $PR_URL"

# Enable automerge
echo ""
echo "Enabling automerge with rebase..."
gh pr merge "$BRANCH_NAME" --auto --rebase
echo "✓ Automerge enabled (will rebase when checks pass)"

echo ""
echo "=== Release $NEW_VERSION PR Created ==="
echo ""
echo "Next steps:"
echo "1. PR will automerge when CI checks pass"
echo "2. After merge, create release tag:"
echo "   git checkout main && git pull"
echo "   git tag -a v$NEW_VERSION -m \"Release v$NEW_VERSION\""
echo "   git push origin v$NEW_VERSION"
echo "   gh release create v$NEW_VERSION --title \"v$NEW_VERSION\" --generate-notes"
