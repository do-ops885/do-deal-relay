# PR #330 Resolution Plan

## Problem
PR #330 (Implement Startup Environment Variable Validation) has:
- Merge conflicts with main (2 files)
- Failed CI checks (Type Check, Quality Gate, Docs Validation, Tests, Validation Gates)
- Unaddressed Codacy review comments
- Unresolved owner review comments

## Tasks

### Task 1: Resolve merge conflicts
- **worker/types.ts**: Accept both `_validated?: boolean` (PR) and `ALLOWED_ORIGINS?: string` (main)
- **tests/integration/referral-redirect.test.ts**: Delete file (main deleted it)
- **Fix auto-merge issues**: Many files auto-merged but may have issues

### Task 2: Fix `worker/types.ts` - Env interface
- Make `DEALS_DB`, `WEBHOOK_SECRET`, `API_ENCRYPTION_KEY` required (non-optional)
- Match runtime validation in config-utils.ts

### Task 3: Fix `worker/lib/config-utils.ts` - Add missing required vars
- Add `ENVIRONMENT` and `GITHUB_REPO` to required vars list (they're marked as required in README)

### Task 4: Fix `worker/index.ts` - Race condition + error safety
- Replace `if (!env._validated)` with module-level promise synchronization
- Fix error message extraction with `instanceof` safety check

### Task 5: Fix failing tests
- Update tests to match new required vars and type changes
- Run `npm run typecheck` and `npm run test`

### Task 6: Run quality_gate.sh
- Ensure all 13 quality gates pass

### Task 7: Commit and push
- Use `ai-commit.sh --type fix --scope worker --subject "..." --body "..."`

### Task 8: PR loop
- Push, re-check CI, fix any remaining failures
