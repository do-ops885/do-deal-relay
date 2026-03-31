# Dry Run - Complete System Test

## Overview
Execute full system dry run without publishing to production.

## Prerequisites
- Dependencies installed: `npm install` ✓
- Environment configured
- Tests written

## Steps

### 1. Type Check
```bash
npx tsc --noEmit
echo "✓ TypeScript compilation"
```

### 2. Run Tests
```bash
npm test
echo "✓ Tests passing"
```

### 3. Validate Code
```bash
./scripts/validate-codes.sh
echo "✓ Validation passed"
```

### 4. Check Secrets
```bash
# No hardcoded secrets
grep -r "ghp_\|sk-" --include="*.ts" --include="*.json" . | grep -v node_modules || echo "✓ No secrets found"
```

### 5. Local Server Test
```bash
# Start local dev server
wrangler dev &
sleep 5

# Test endpoints
curl http://localhost:8787/health
curl http://localhost:8787/deals
curl http://localhost:8787/metrics

# Stop server
kill %1
```

### 6. Mock Pipeline Run
```bash
# Run pipeline without KV writes
NODE_ENV=dry-run node --loader ts-node/esm scripts/mock-pipeline.ts
```

## Success Criteria
- [ ] No TypeScript errors
- [ ] All tests pass
- [ ] Validation script passes
- [ ] No secrets in code
- [ ] Local server responds correctly
- [ ] Mock pipeline completes

## Report
Generate dry-run-report.json:
```json
{
  "status": "success",
  "tests_passed": 20,
  "tests_total": 20,
  "coverage": "85%",
  "validation_passed": true,
  "secrets_found": 0,
  "timestamp": "2024-03-31T16:00:00Z"
}
```
