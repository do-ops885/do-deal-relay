#!/bin/bash
#
# Setup Git Hooks with Guard Rails
# This script configures git to use the project's hooks
#

echo "🔧 Setting up Git Hooks with Guard Rails..."
echo ""

# Get the project root
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
HOOKS_DIR="$PROJECT_ROOT/.githooks"

# Check if we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not a git repository!"
    exit 1
fi

# Make all hooks executable
echo "Making hooks executable..."
chmod +x "$HOOKS_DIR"/pre-commit 2>/dev/null || echo "  ⚠ pre-commit not found"
chmod +x "$HOOKS_DIR"/pre-push 2>/dev/null || echo "  ⚠ pre-push not found"
chmod +x "$HOOKS_DIR"/commit-msg 2>/dev/null || echo "  ⚠ commit-msg not found"

# Configure git to use our hooks directory
echo "Configuring git hooks path..."
git config core.hooksPath "$HOOKS_DIR"

# Verify installation
echo ""
echo "✅ Git Hooks Installed!"
echo ""
echo "Active hooks:"

if [ -f "$HOOKS_DIR/pre-commit" ]; then
    echo "  ✓ pre-commit - Blocks dangerous commits"
    echo "    • Secret detection"
    echo "    • File size limits"
    echo "    • Blocked patterns"
    echo "    • Code quality checks"
fi

if [ -f "$HOOKS_DIR/pre-push" ]; then
    echo "  ✓ pre-push - Prevents broken pushes"
    echo "    • TypeScript compilation"
    echo "    • Test execution"
    echo "    • Validation script"
    echo "    • Branch protection"
fi

if [ -f "$HOOKS_DIR/commit-msg" ]; then
    echo "  ✓ commit-msg - Validates commit messages"
    echo "    • Conventional commits format"
    echo "    • Message length"
    echo "    • WIP detection"
fi

echo ""
echo "📋 To bypass hooks (emergency only):"
echo "  git commit --no-verify"
echo "  git push --no-verify"
echo ""
echo "🔒 Hooks location: $HOOKS_DIR"
echo "📝 Git config: core.hooksPath = $(git config core.hooksPath)"
