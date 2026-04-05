#!/bin/bash
# Release workflow script
# Single source of truth: VERSION file
# All other version references are derived from it
# Usage: ./scripts/release.sh [version]

set -e

echo "=== Release Workflow ==="
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

# Validate version format (must be x.y.z, no alpha/beta)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Invalid version format: $NEW_VERSION"
    echo "Version must be in format x.y.z (e.g., 0.1.1)"
    echo "No alpha, beta, or pre-release suffixes allowed"
    exit 1
fi

echo ""
echo "Releasing version: $NEW_VERSION"
read -p "Continue? [y/N]: " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
fi

# Update VERSION file (SINGLE SOURCE OF TRUTH)
echo "$NEW_VERSION" > VERSION
echo "✓ Updated VERSION (single source of truth)"

# Generate worker/version.ts from VERSION
bash scripts/generate-version.sh
echo "✓ Generated worker/version.ts"

# Update package.json (derived from VERSION)
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "✓ Updated package.json"

# Update package-lock.json
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package-lock.json 2>/dev/null || true
echo "✓ Updated package-lock.json"

# Update skill metadata
sed -i "s/version: \".*\"/version: \"$NEW_VERSION\"/" .agents/skills/do-deal-relay/SKILL.md
sed -i "s/Current: v[0-9]*\.[0-9]*\.[0-9]*/Current: v$NEW_VERSION/" .agents/skills/do-deal-relay/SKILL.md
echo "✓ Updated .agents/skills/do-deal-relay/SKILL.md"

# Update AGENTS.md
sed -i "s/\*\*Version\*\*: [0-9]*\.[0-9]*\.[0-9]*/\*\*Version\*\*: $NEW_VERSION/" AGENTS.md
echo "✓ Updated AGENTS.md"

# Update README.md version badge
sed -i "s/Version.*:.*[0-9]\+\.[0-9]\+\.[0-9]\+/Version: $NEW_VERSION/" README.md
echo "✓ Updated README.md"

# Update test files
find tests -name "*.ts" -exec sed -i "s/version: \"[^\"]*\"/version: \"$NEW_VERSION\"/g" {} \;
find tests -name "*.ts" -exec sed -i "s/schema_version: \"[^\"]*\"/schema_version: \"$NEW_VERSION\"/g" {} \;
echo "✓ Updated test files"

# Update public/deals.json
if [ -f public/deals.json ]; then
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" public/deals.json
    sed -i "s/\"schema_version\": \"[^\"]*\"/schema_version: \"$NEW_VERSION\"/" public/deals.json
    echo "✓ Updated public/deals.json"
fi

# Update docs/API.md examples
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/g" docs/API.md
echo "✓ Updated docs/API.md"

# Update other doc files
for file in docs/AGENTS.md agents-docs/SYSTEM_REFERENCE.md QUICKSTART.md; do
    if [ -f "$file" ]; then
        sed -i "s/\b$CURRENT_VERSION\b/$NEW_VERSION/g" "$file" 2>/dev/null || true
    fi
done
echo "✓ Updated documentation"

# Run quality gates
echo ""
echo "Running quality gates..."
./scripts/quality_gate.sh

# Run tests
echo ""
echo "Running tests..."
npm run test:ci

echo ""
echo "=== Release $NEW_VERSION Ready ==="
echo ""
echo "Next steps:"
echo "1. Review changes: git diff --stat"
echo "2. Stage changes: git add -A"
echo "3. Commit: git commit -m 'release: version $NEW_VERSION'"
echo "4. Push: git push origin main"
echo ""
echo "Or use atomic commit:"
echo "  git add -A && git commit -m 'release: version $NEW_VERSION' && git push origin main"
