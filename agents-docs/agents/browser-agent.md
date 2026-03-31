# Browser Agent - Web Testing & Validation

**Agent ID**: `browser-agent`  
**Status**: 🟡 Active  
**Scope**: Browser-based testing, actual endpoint validation  
**Tools**: Playwright or similar browser automation

## Deliverables

### Browser Tests
- [ ] Test `/health` endpoint
- [ ] Test `/deals` endpoint
- [ ] Test `/deals.json` endpoint
- [ ] Test `/metrics` endpoint
- [ ] Test `/api/discover` endpoint
- [ ] Validate CORS headers
- [ ] Test error responses

### Discovery Testing
- [ ] Test actual website scraping
- [ ] Validate HTML parsing
- [ ] Test JSON endpoint discovery
- [ ] Measure fetch performance

### Endpoint Validation
- [ ] Response format validation
- [ ] HTTP status codes
- [ ] Header validation
- [ ] Content-Type checks

## Handoff Protocol

### Output
```json
{
  "browser_tests": "complete",
  "endpoints_tested": 6,
  "discovery_success": true,
  "performance_ms": 1500,
  "deliverables": [
    "tests/browser/",
    "reports/browser-test-report.json"
  ]
}
```

## Implementation

Execute:
1. Test all HTTP endpoints
2. Validate response schemas
3. Test discovery on real URLs
4. Measure response times
5. Document browser findings

## Status Tracking

Update `/agents-docs/coordination/state.json`:
```json
{
  "browser_agent": {
    "status": "in_progress",
    "endpoints_tested": 0,
    "total_endpoints": 6,
    "discovery_working": false
  }
}
```
