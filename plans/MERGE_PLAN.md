# PR Merge Plan

## Summary
- 10 open PRs analyzed
- 8 PRs ready to merge (CI passes)
- 2 PRs need investigation (CI fails)

## PR Status Matrix

| PR | Title | CI | Conflicts | Recommendation |
|----|-------|-----|-----------|----------------|
| 546 | github-actions group | ✅ Pass | No | Merge |
| 547 | actions/setup-go | ✅ Pass | No | Merge |
| 548 | actions/checkout | ✅ Pass | No | Merge |
| 544 | protobufjs | ✅ Pass | No | Merge |
| 545 | @types/node | ✅ Pass | No | Merge |
| 542 | testing group | ✅ Pass | No | Merge |
| 540 | Jules - 7 safe deps | ✅ Pass | No | Merge |
| 539 | Jules - playwright | ✅ Pass | No | Merge |
| 541 | cloudflare group | ❌ Fail | No | Investigate |
| 543 | workers-types | ❌ Fail | No | Investigate |

## Merge Order (Dependency-aware)
1. **Batch 1 - Independent CI PRs**: #546, #544
2. **Batch 2 - CI dependent PRs**: #547, #548
3. **Batch 3 - Independent deps**: #545, #542
4. **Batch 4 - Complex deps**: #540, #539
5. **Batch 5 - Fix failing PRs**: #541, #543

## Merge Commands
```bash
# Batch 1 - Independent CI PRs
gh pr merge 546 --squash --delete-branch
gh pr merge 544 --squash --delete-branch

# Wait for batch 1 to complete

# Batch 2 - CI dependent PRs
gh pr merge 547 --squash --delete-branch
gh pr merge 548 --squash --delete-branch

# Wait for batch 2 to complete

# Batch 3 - Independent deps
gh pr merge 545 --squash --delete-branch
gh pr merge 542 --squash --delete-branch

# Wait for batch 3 to complete

# Batch 4 - Complex deps
gh pr merge 540 --squash --delete-branch
gh pr merge 539 --squash --delete-branch

# Batch 5 - Investigate and fix
# PR #541 and #543 need manual investigation
```

## Quality Gate
After each batch:
1. Run `./scripts/agent-toolkit.sh quality`
2. Verify main branch is clean
3. Proceed to next batch

## Risk Assessment
- **Low risk**: All PRs are dependency updates
- **Medium risk**: PR #541 has breaking changes in vitest-pool-workers
- **High risk**: PR #543 has major version bump of @cloudflare/workers-types
