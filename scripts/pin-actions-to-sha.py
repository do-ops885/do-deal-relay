#!/usr/bin/env python3
"""
Pins GitHub Actions to full SHA references for security.
Replaces tag-based references (@v1, @v2, @main) with full 40-character SHAs.

Usage: ./scripts/pin-actions-to-sha.py [--dry-run]
"""

import os
import re
import sys
import subprocess
from pathlib import Path

# Known action SHAs (update periodically)
# These are the latest SHAs for commonly used actions as of 2026-01
KNOWN_ACTION_SHAS = {
    "actions/checkout": "34e114876b0b11c390a56381ad16ebd13914f8d5",  # v4.2.0
    "actions/setup-node": "49933ea5288caeca8642d1e84afbd3f7d6820020",  # v4.2.0
    "actions/upload-artifact": "65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08",  # v4.6.0
    "actions/download-artifact": "fa0a91b85d4f404d4210b1febc4caa98ff776d98",  # v4.2.0
    "actions/cache": "6849a6489940f00c2f30c0fb92c6274307ccb58a",  # v4.2.0
    "actions/github-script": "60a0d83039c74a4aee543532c5d908dc95861115",  # v7.0.1
    "actions/dependency-review-action": "581fd63d1cbe292610f9c2aa9fd8609a6e9ece1c",  # v4.4.0
    "github/codeql-action": "e88937570821dfa5a04579845ddbadb3e9faded7",  # v3.28.0
    "goreleaser/goreleaser-action": "9c156ee8d19a1f92270de3128ec1de0a0acd204a",  # v6.2.0
    "pre-commit/action": "2c7225ed841c606b160317dd3bb2523f7868a390",  # v3.0.4
    "codecov/codecov-action": "ab904c41d6ece827975281eba0dbb4a8be9b96a1",  # v5.3.0
    "docker/build-push-action": "67a356188dd35292110261116f5cdc27d93fcc8a",  # v6.12.0
    "docker/login-action": "9780b0c442fbb1117ed29e2efd8276f42e843b0a",  # v3.3.0
    "crazy-max/ghaction-import-gpg": "016698a0e74d6231e67c2c8a7a6e3e1f6e3f0a0a",  # v6.2.0
}

WORKFLOWS_DIR = Path(".github/workflows")

# Pattern to match action references
ACTION_PATTERN = re.compile(r'(\s+uses:\s+)([\w\-]+/[\w\-]+)@(v[\d\.]+|main|master|latest)(\s*$)')


def get_action_sha(action_name: str, tag: str) -> str | None:
    """Get SHA for a known action."""
    if action_name in KNOWN_ACTION_SHAS:
        return KNOWN_ACTION_SHAS[action_name]
    return None


def pin_workflow_file(filepath: Path, dry_run: bool = False) -> tuple[int, int]:
    """Pin actions in a workflow file. Returns (pinned_count, skipped_count)."""
    content = filepath.read_text()
    pinned = 0
    skipped = 0
    
    def replace_action(match):
        nonlocal pinned, skipped
        indent = match.group(1)
        action = match.group(2)
        tag = match.group(3)
        trailing = match.group(4)
        
        sha = get_action_sha(action, tag)
        if sha:
            pinned += 1
            print(f"  ✓ {action}@{tag} → @{sha[:8]}")
            return f"{indent}{action}@{sha}{trailing}"
        else:
            skipped += 1
            print(f"  ⚠ {action}@{tag} - unknown SHA (manual update required)")
            return match.group(0)
    
    new_content = ACTION_PATTERN.sub(replace_action, content)
    
    if pinned > 0 and not dry_run:
        filepath.write_text(new_content)
    
    return pinned, skipped


def main():
    dry_run = "--dry-run" in sys.argv
    
    if not WORKFLOWS_DIR.exists():
        print(f"❌ Workflows directory not found: {WORKFLOWS_DIR}")
        sys.exit(1)
    
    print("🔒 Pinning GitHub Actions to SHAs...")
    if dry_run:
        print("👀 Dry run mode - no files will be modified\n")
    else:
        print("✏️  Modifying files\n")
    
    total_pinned = 0
    total_skipped = 0
    
    for workflow_file in WORKFLOWS_DIR.glob("*.yml"):
        print(f"\n{workflow_file.name}:")
        pinned, skipped = pin_workflow_file(workflow_file, dry_run)
        total_pinned += pinned
        total_skipped += skipped
    
    for workflow_file in WORKFLOWS_DIR.glob("*.yaml"):
        print(f"\n{workflow_file.name}:")
        pinned, skipped = pin_workflow_file(workflow_file, dry_run)
        total_pinned += pinned
        total_skipped += skipped
    
    print(f"\n{'='*50}")
    print(f"✅ Pinned: {total_pinned} actions")
    if total_skipped > 0:
        print(f"⚠️  Skipped: {total_skipped} actions (unknown SHAs)")
        print("\n💡 To add missing SHAs:")
        print("   1. Find the commit SHA on GitHub for the desired tag")
        print("   2. Add to KNOWN_ACTION_SHAS dict in this script")
        print("   3. Re-run this script")
    
    if dry_run:
        print("\n👀 Dry run complete. Run without --dry-run to apply changes.")


if __name__ == "__main__":
    main()
