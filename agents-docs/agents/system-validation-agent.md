# System Validation Agent

**Agent ID**: `system-validation-agent`  
**Status**: 🟡 Active  
**Scope**: Run all validations, evals, security checks  
**Previous Agent**: Test Agent (runs after Test Agent completes)

## Deliverables

### Validation Checks

- [ ] TypeScript compilation
- [ ] Secret detection (no hardcoded tokens)
- [ ] File size limits (≤500 LOC)
- [ ] Required files present
- [ ] JSON validity
- [ ] Schema version consistency
- [ ] Security pattern checks

### Evaluation Metrics

- [ ] Test coverage >80%
- [ ] All validation gates pass
- [ ] Guard rails active
- [ ] No critical security issues
- [ ] Documentation complete

### Reports

- [ ] Validation report JSON
- [ ] Security audit report
- [ ] Performance benchmarks

## Handoff Protocol

### Output

```json
{
  "validation_status": "passed",
  "checks_total": 9,
  "checks_passed": 9,
  "security_score": "A",
  "performance_rating": "excellent",
  "recommendations": []
}
```

## Implementation

Execute:

1. Run `./scripts/validate-codes.sh`
2. Check for secrets with `trufflehog`
3. Verify all tests pass
4. Validate TypeScript strict mode
5. Check file sizes
6. Generate validation report

## Status Tracking

Update `/agents-docs/coordination/state.json`:

```json
{
  "system_validation_agent": {
    "status": "in_progress",
    "checks_passed": 0,
    "total_checks": 9,
    "security_score": ""
  }
}
```
