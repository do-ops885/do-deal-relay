# Test Agent - Comprehensive Testing Suite

**Agent ID**: `test-agent`
**Status**: 🟡 Active
**Scope**: Unit tests, integration tests, e2e tests, dry runs
**Parallel Agents**: Validation Agent, Doc Agent, GitHub Agent

## Deliverables

### Unit Tests

- [ ] `tests/unit/crypto.test.ts` - Hashing utilities
- [ ] `tests/unit/lock.test.ts` - Distributed locking
- [ ] `tests/unit/logger.test.ts` - JSONL logging
- [ ] `tests/unit/storage.test.ts` - KV operations
- [ ] `tests/unit/guard-rails.test.ts` - Safety checks

### Integration Tests

- [ ] `tests/integration/pipeline.test.ts` - Full pipeline
- [ ] `tests/integration/state-machine.test.ts` - State transitions
- [ ] `tests/integration/api.test.ts` - HTTP endpoints

### E2E Tests

- [ ] `tests/e2e/discovery.test.ts` - End-to-end discovery
- [ ] `tests/e2e/publish.test.ts` - Publish flow

### Dry Run Scripts

- [ ] `scripts/dry-run.sh` - Full system dry run
- [ ] `scripts/local-test.sh` - Local validation

## Handoff Protocol

### Output

```json
{
  "test_coverage": "85%",
  "tests_passing": "42/42",
  "dry_run_status": "success",
  "critical_issues": [],
  "deliverables": ["tests/", "scripts/dry-run.sh", "coverage/"]
}
```

### Dependencies

- Vitest framework
- Miniflare for local testing
- Mock data fixtures

## Implementation

Execute this agent's scope:

1. Create test directory structure
2. Write unit tests for all modules
3. Create integration tests
4. Build dry run scripts
5. Run full test suite
6. Generate coverage report

## Status Tracking

Update `/agents-docs/coordination/state.json`:

```json
{
  "test_agent": {
    "status": "in_progress",
    "tests_written": 0,
    "tests_passing": 0,
    "coverage": 0
  }
}
```
