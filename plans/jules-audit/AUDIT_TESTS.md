# AUDIT_TESTS

## Uncovered Logic
- `worker/lib/github/workflows.ts`: 0% coverage (based on raw log if not listed, actually it's 0% in many files).
- `worker/routes/auth.ts`: 0% coverage.
- `worker/routes/dashboard.ts`: 0% coverage.

## Proposed New Tests
1. **GitHub Workflow Trigger**: Add test for `triggerWorkflow` in `worker/lib/github/workflows.ts`.
2. **Dashboard Stats Aggregation**: Add test for logic in `worker/routes/dashboard.ts` (if extractable).
3. **Auth Permission Logic**: Add more edge cases for RBAC in `worker/middleware/authorization.ts`.
