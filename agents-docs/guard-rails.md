## Guard Rails (Safety Mechanisms)

### Overview
Guard rails are automated safety checks that prevent the system from:
- Processing malicious data
- Exceeding resource limits
- Producing inconsistent results
- Violating security policies

### Implementation
Guard rails are implemented in `worker/lib/guard-rails.ts` and enforced at:
1. **Input stage** - Resource limits, payload validation
2. **Processing stage** - Safety checks, XSS prevention
3. **Output stage** - Data quality, consistency checks

### Guard Rail Types

#### Safety Guard Rails
- **XSS Prevention**: Detects `<script>`, `javascript:`, `onerror=` patterns
- **URL Validation**: Blocks dangerous schemes (javascript:, data:, vbscript:)
- **Control Character Detection**: Prevents injection of control chars

#### Resource Guard Rails
- **Deal Count Limit**: Max 1000 deals per run (CONFIG.MAX_DEALS_PER_RUN)
- **Payload Size**: Max 1MB per request (CONFIG.MAX_PAYLOAD_SIZE_BYTES)
- **Field Length**: Title ≤200, Description ≤1000, Code ≤50 chars

#### Rate Limiting
- **Request Window**: 100 requests per minute
- **Automatic Reset**: Window expires after 1 minute
- **Graceful Degradation**: Returns 429 Too Many Requests

#### Quality Guard Rails
- **Required Fields**: Code, Title, URL must be present
- **URL Validity**: All URLs must be parseable
- **Duplicate Detection**: Tracks duplicate codes
- **Anomaly Detection**: Flags rewards >5× average or >$1000

#### Consistency Guard Rails
- **Count Validation**: Deal count should not increase after deduplication
- **Data Loss Detection**: Flags if >50% of deals disappear
- **Hash Integrity**: Tracks deals through pipeline stages

### Enforcement

```typescript
// Run checks
const report = await runGuardRails(deals, 'processing');

// Enforce (throws on fatal errors)
await enforceGuardRails(deals, 'output');
```

### Error Handling

**Fatal Errors** (block execution):
- XSS detected
- Resource limits exceeded
- Invalid data quality
- Consistency violations

**Warnings** (logged, don't block):
- Duplicate codes
- High reward values
- Data loss >20%

### Response Format

```json
{
  "allPassed": false,
  "checks": [
    {
      "name": "safety_check",
      "passed": false,
      "severity": "fatal",
      "message": "XSS attempt detected in deal title"
    }
  ],
  "fatalErrors": ["Deal sha256: XSS attempt detected"],
  "warnings": ["3 deals have duplicate codes"]
}
```

### Best Practices

1. **Always run guard rails** before publishing
2. **Log all violations** for audit trail
3. **Alert on fatal errors** via notification system
4. **Review warnings** periodically for patterns
5. **Update patterns** as new threats emerge

### Integration

Guard rails are automatically integrated into:
- State machine (before each stage transition)
- API endpoints (input validation)
- Publish flow (pre-publication check)
- Validation gates (additional safety layer)
