# Production Readiness Plan

**Created**: 2026-04-02
**Version**: 0.1.1
**Status**: In Progress

## Overview

This plan tracks all warnings, issues, and incomplete items required for production readiness. Items are organized by priority and category.

---

## Deployment Status

**Last Deploy Attempt**: 2026-04-02
**Status**: Partial Success

### What Worked

- ✅ Pre-deploy validation passed
- ✅ Cloudflare deploy succeeded (wrangler.toml fix worked)
- ✅ Worker is deployed and running

### Current Issue

- ❌ Smoke tests failing due to empty KV namespace
- ❌ Health check returns 503 (no production snapshot in KV)

### Solution (from LESSON-014)

Initialize production KV with seed data:

```bash
# Get the namespace ID from wrangler.toml (DEALS_PROD)
# Then run:
wrangler kv key put --namespace-id=23ee9b8c9e2748e5880f476b8b57a524 "snapshot:prod" '{"version":"0.1.1","deals":[],"stats":{"total":0,"active":0}}'
```

Or trigger initial discovery:

```bash
curl -X POST https://do-deal-relay.<account-id>.workers.dev/api/discover
```

**Note**: This is documented in LESSON-014 as expected behavior for fresh deployments. The "degraded" health status resolves after first snapshot is created.

---

## Security Audit (IN PROGRESS)

### Current Status: Extension Audit Complete

- ✅ **Browser Extension XSS Audit** (2026-04-02): SECURE - No vulnerabilities found
- ⏳ **Remaining Audit Items**: Pending (see below)

Based on AGENTS.md Production Readiness Checklist, a comprehensive security audit is required before production deployment. Extension XSS review complete with secure findings.

### Items to Address

#### 1. XSS Vulnerabilities in Browser Extension

**File**: `extension/popup.js`
**Status**: ✅ **SECURE** - No action required
**Reviewed**: 2026-04-02

**Initial Concern**: `innerHTML` usage detected (potential XSS vector)

**Actual Security Assessment**:

- All `innerHTML` usage is limited to `innerHTML = ""` (clearing containers) - **SAFE**
- All dynamic content uses `textContent` which escapes HTML - **SAFE**
- URLs validated via `new URL()` before use in `src` attributes - **SAFE**
- User input validated with strict regex `/^[A-Z0-9]+$/i` - **SAFE**
- All dynamic HTML built via DOM API (`createElement`, `appendChild`) - **SAFE**

**Security Measures Verified**:

1. ✅ Line 106: `pageTitle.textContent = tab.title` - textContent escapes HTML
2. ✅ Lines 111, 113: `pageUrl.textContent` - safe text insertion
3. ✅ Lines 126-131: Favicon URL validated (http/https only) before img.src assignment
4. ✅ Lines 203-239: Detection list built entirely with createElement/textContent
5. ✅ Lines 269-277: Status indicator built with createElement/textContent
6. ✅ Line 421: Toast messages via textContent (error messages escaped)
7. ✅ Lines 321-324: Input validation prevents injection via regex

**Conclusion**: Code is XSS-secure. No vulnerabilities found.

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

1. [x] Review XSS security in extension/popup.js (SECURE - no action needed)
2. [ ] Enable CodeQL or disable failing job
3. [ ] Fix GitHub Actions rollback permissions

### Short Term (Next 2 Weeks)

4. [ ] Complete remaining security audit items
5. [ ] Implement load testing suite
6. [ ] Update to Node.js 24 (before June 2026)

### Long Term (Next Month)

7. [ ] Performance optimization based on load testing results
8. [ ] Security penetration testing
9. [ ] Documentation review and updates

---

## Success Criteria

Production readiness achieved when:

- [x] Extension XSS audit complete (no vulnerabilities found)
- [ ] All other HIGH priority items resolved
- [ ] Full security audit complete with no critical findings
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
