# Production Readiness Plan

**Created**: 2026-04-02
**Version**: 0.1.1
**Status**: In Progress

## Overview

This plan tracks all warnings, issues, and incomplete items required for production readiness. Items are organized by priority and category.

---

## Security Audit (PENDING)

### Current Status: Not Started

Based on AGENTS.md Production Readiness Checklist, a comprehensive security audit is required before production deployment.

### Items to Address

#### 1. XSS Vulnerabilities in Browser Extension

**File**: `extension/popup.js`
**Issue**: `innerHTML` usage detected (potential XSS vector)
**Lines**: Multiple locations using `elements.*.innerHTML`

```javascript
// Current code (vulnerable):
elements.favicon.innerHTML = `<img src="${tab.favIconUrl}" ...>`;
elements.detectionList.innerHTML = detections;
elements.scanStatus.innerHTML = `...`;
```

**Solution**:

- Use `textContent` instead of `innerHTML` where possible
- Sanitize all dynamic content before insertion
- Use DOM API (`createElement`, `appendChild`) for dynamic HTML
- Validate all URLs before using in `src` attributes

**Priority**: HIGH
**Assigned**: Security Review Agent
**ETA**: 2026-04-05

#### 2. CodeQL Not Enabled

**Issue**: Code scanning is not enabled in repository settings
**Impact**: Security & Compliance workflow fails

**Solution**:

- Enable CodeQL in GitHub repository security settings
- Or disable CodeQL job in `.github/workflows/security.yml` if not needed

**Priority**: MEDIUM
**Assigned**: Repository Admin

#### 3. HTTP URLs in Codebase

**Files Affected**:

- `scripts/cli/config.ts`: `http://localhost:8787`
- `scripts/validate-url-preservation.ts`: `http://localhost`

**Issue**: HTTP URLs should use HTTPS in production

**Solution**:

- These are development URLs (localhost) - acceptable for dev
- Add environment-based URL switching
- Document which URLs are dev-only vs production

**Priority**: LOW (dev-only URLs)

---

## Load Testing (PENDING)

### Current Status: Not Started

Based on AGENTS.md Production Readiness Checklist, load testing is required before production deployment.

### Test Scenarios

1. **API Endpoint Load Testing**
   - Endpoint: `/api/referrals`
   - Target: 1000 req/min
   - Duration: 10 minutes
   - Success criteria: <200ms p95 latency, 0% error rate

2. **Webhook Load Testing**
   - Concurrent webhook deliveries: 100
   - Payload size: 1KB average
   - Duration: 5 minutes
   - Success criteria: 100% delivery success, <500ms processing time

3. **KV Storage Load Testing**
   - Operations: Read/Write/Delete
   - Volume: 10,000 operations
   - Concurrency: 50 parallel
   - Success criteria: No rate limiting, consistent performance

### Tools Required

- Artillery.js or k6 for API load testing
- Cloudflare Workers Analytics for KV monitoring
- Custom webhook simulator script

**Priority**: HIGH
**Assigned**: Performance Testing Agent
**ETA**: 2026-04-10

---

## Code Quality Warnings

### TODO/FIXME Comments

**Count**: 1 found
**Status**: Review recommended

**Action**:

- Audit all TODO/FIXME comments
- Convert actionable items to GitHub issues
- Remove resolved or outdated comments

**Priority**: LOW
**ETA**: 2026-04-03

---

## GitHub Actions Issues

### 1. Rollback Notification Permissions

**Issue**: `issues: write` permission missing for rollback notifications
**Workflow**: `deploy-production.yml`
**Error**: `Resource not accessible by integration`

**Solution Options**:

- Add `permissions: issues: write` to workflow
- Or remove automatic issue creation (use notifications instead)
- Or create a dedicated service account with issue permissions

**Priority**: MEDIUM
**Assigned**: DevOps Agent
**ETA**: 2026-04-04

### 2. Node.js 20 Deprecation Warnings

**Issue**: GitHub Actions using deprecated Node.js 20
**Impact**: Warnings in all workflows

**Timeline**:

- Node.js 24 becomes default: June 2, 2026
- Node.js 20 removed: September 16, 2026

**Solution**:

- Update workflow actions to Node.js 24 compatible versions
- Or set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to opt in early

**Priority**: LOW (has until September 2026)
**ETA**: 2026-06-01

---

## Documentation Updates

### Outdated References

**Status**: Fixed in commit `e6bca3a`

**Changes Made**:

- Updated AGENTS.md file paths (referral-storage/, research-agent/)
- Updated CLI commands to use new modular structure
- Added LESSON-020 documenting file split work
- Fixed version inconsistency (0.1.1)

---

## Next Actions

### Immediate (This Week)

1. [ ] Fix XSS vulnerabilities in extension/popup.js
2. [ ] Enable CodeQL or disable failing job
3. [ ] Fix GitHub Actions rollback permissions

### Short Term (Next 2 Weeks)

4. [ ] Complete security audit
5. [ ] Implement load testing suite
6. [ ] Update to Node.js 24 (before June 2026)

### Long Term (Next Month)

7. [ ] Performance optimization based on load testing results
8. [ ] Security penetration testing
9. [ ] Documentation review and updates

---

## Success Criteria

Production readiness achieved when:

- [ ] All HIGH priority items resolved
- [ ] Security audit complete with no critical findings
- [ ] Load testing passes all scenarios
- [ ] All GitHub Actions workflows passing
- [ ] Documentation fully synchronized

---

## References

- LESSON-020: File Size Management and Modular Architecture
- AGENTS.md: Production Readiness Checklist
- `.github/workflows/`: CI/CD configuration
- `scripts/validate-codes.sh`: Validation gates

_Last Updated: 2026-04-02_
