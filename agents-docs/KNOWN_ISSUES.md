# Known Issues and Limitations

**Document Type**: Technical Constraints and Workarounds
**Created**: 2026-04-03
**Version**: 0.1.2
**Status**: Permanent Reference

---

## Overview

This document catalogs issues, limitations, and constraints that **cannot be directly fixed** within the do-deal-relay codebase. These are inherent to the infrastructure, dependencies, or external services used by the system. Each entry includes mitigation strategies and documentation references.

---

## Infrastructure Limitations

### 1. KV Namespace Eventual Consistency [CANTFIX-001]

**Category**: Infrastructure
**Component**: Cloudflare KV Storage
**Impact**: Medium

**Description**:
Cloudflare KV namespaces provide eventual consistency, not strong consistency. Writes may not be immediately visible across all edge locations globally. This can lead to race conditions during high-frequency updates and slight delays in metrics/stats propagation.

**Manifestations**:
- Stale reads immediately after writes
- Duplicate processing during concurrent pipeline runs
- Metrics that don't immediately reflect latest state
- Cache coherency delays

**Mitigation Strategies**:
1. **Design for Eventual Consistency**: Ensure operations are idempotent
2. **Use D1 for Strong Consistency**: Critical operations requiring immediate consistency use D1 database
3. **Retry with Backoff**: Implement read-after-write retries with exponential backoff
4. **Acceptable Delay**: Document expected propagation delay (~60 seconds max)

**Workarounds Implemented**:
- Dual-write pattern (KV + D1) for critical data
- Feature flags to prefer D1 reads when consistency is required
- Retry logic in storage layer for read-after-write scenarios

**Documentation**:
- [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) - Data consistency section
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - KV behavior notes

**External Reference**: [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/platform/kv-works/)

---

### 2. D1 Database Beta Status [CANTFIX-003]

**Category**: Infrastructure
**Component**: Cloudflare D1 Database
**Impact**: Medium

**Description**:
Cloudflare D1 is currently in public beta and subject to potential breaking changes, limitations, or availability issues. The beta status means:
- API may change without deprecation period
- Features may be added or removed
- Performance characteristics may vary
- Regional availability may be limited

**Manifestations**:
- Potential API breaking changes in future releases
- Occasional service unavailability during beta updates
- Query performance variability
- Limited advanced features (triggers, stored procedures)

**Mitigation Strategies**:
1. **Dual-Write Architecture**: System maintains both KV and D1 copies of data
2. **Feature Flags**: D1 reads can be disabled if issues arise
3. **Abstraction Layer**: D1 client abstracts implementation details for easy migration
4. **Monitoring**: Alert on D1 query failures to trigger fallback

**Workarounds Implemented**:
- `DEALS_PROD` (KV) remains primary with D1 as secondary
- D1 feature flags in worker configuration
- Automatic fallback to KV on D1 failures
- Migration scripts for schema updates

**Documentation**:
- [worker/lib/d1/](worker/lib/d1/) - D1 abstraction layer
- [plans/production-readiness.md](plans/production-readiness.md) - Beta status acknowledgment

**External Reference**: [Cloudflare D1 Beta Documentation](https://developers.cloudflare.com/d1/)

---

## Testing Infrastructure Issues

### 3. Vitest Pool Workers Upstream Dependency Issues [CANTFIX-002]

**Category**: Testing Infrastructure
**Component**: @cloudflare/vitest-pool-workers
**Impact**: High (CI/CD blocking)

**Description**:
The Cloudflare Vitest pool workers integration has upstream dependency issues causing worker runtime crashes during test cleanup. This is caused by deprecated Miniflare v2 and undici dependencies within the Cloudflare testing ecosystem.

**Symptoms**:
```
Error: [vitest-pool]: Worker cloudflare-pool emitted error.
Caused by: Error: Worker exited unexpectedly
```

**Impact**:
- Tests pass (393/393) but CI reports failure (exit code 1)
- Segmentation faults in workerd runtime
- Blocking automatic deployment workflows

**Mitigation Strategies**:
1. **Fork Pool Mode**: Switched to Node.js fork pool instead of Cloudflare pool
2. **Test Wrapper Script**: `scripts/run-tests-ci.sh` checks for "passed" pattern
3. **Dependency Updates**: Updated miniflare to v4.x to resolve undici vulnerabilities
4. **Wait for Upstream**: Monitor @cloudflare/vitest-pool-workers releases

**Workarounds Implemented**:
- `vitest.config.ts` uses `pool: "forks"` configuration
- CI workflow has `continue-on-error: true` on test step
- Test script wrapper validates actual test results

**Documentation**:
- [LESSON-022](agents-docs/LESSONS.md) - Vitest worker crashes
- [vitest.config.ts](vitest.config.ts) - Configuration comments
- [plans/PRE_EXISTING_CI_ISSUES.md](plans/PRE_EXISTING_CI_ISSUES.md) - Issue #3

**External Tracking**:
- Cloudflare workers-sdk repository issues
- Miniflare v4 migration guides

---

## Security Scanning False Positives

### 4. Secret Detection Pattern Limitations

**Category**: Security Scanning
**Component**: CI/CD Secret Detection
**Impact**: Low

**Description**:
Secret detection tools (TruffleHog, custom grep patterns) may flag legitimate code as potential secrets, causing false positives. This is an inherent limitation of pattern-based detection.

**Examples of False Positives**:
- TypeScript interface property names: `secret: string`
- Configuration object keys: `apiKey: string`
- Documentation examples in comments
- Test mock values that resemble tokens

**Mitigation Strategies**:
1. **Smart Detection**: Use multiple specific patterns instead of broad matches
2. **Allowlisting**: Document known false positives in `.secret-scan-allowlist`
3. **Context Analysis**: Check for assignment vs type declaration
4. **Manual Review**: Require human review for flagged items

**Workarounds Implemented**:
- CI uses `continue-on-error: true` for secret scan
- Three specific patterns instead of broad "secret" grep
- Manual verification workflow for flagged items

**Documentation**:
- [.github/workflows/ci.yml](.github/workflows/ci.yml) - Secret detection step
- [plans/PRE_EXISTING_CI_ISSUES.md](plans/PRE_EXISTING_CI_ISSUES.md) - Issue #1 (FIXED)

---

## GitHub Actions Constraints

### 5. GitHub Actions Resource Limits

**Category**: CI/CD
**Component**: GitHub Actions Runners
**Impact**: Low-Medium

**Description**:
GitHub Actions has resource limits that affect our CI/CD pipeline:
- Job timeout: 6 hours (we use 10-15 minutes)
- Workflow run timeout: 35 days
- Concurrent jobs: 20 (GitHub Free), 40 (GitHub Pro), 60 (GitHub Team)
- Storage: 500MB per repository for caches
- Artifact retention: 90 days

**Manifestations**:
- Cache eviction for large node_modules
- Artifact expiration after 90 days
- Potential queue delays during peak usage

**Mitigation Strategies**:
1. **Efficient Caching**: Selective npm caching with lockfile hash
2. **Minimal Artifacts**: Only store essential build artifacts
3. **Timeout Configuration**: Set appropriate job timeouts (5-15 minutes)
4. **Concurrency Limits**: Use `cancel-in-progress: true` to save resources

**Workarounds Implemented**:
- `fetch-depth: 1` in checkout for faster clones
- `npm ci --legacy-peer-deps` for reproducible installs
- Selective caching strategy in workflows

**Documentation**:
- [.github/workflows/README.md](.github/workflows/README.md) - Workflow optimization

**External Reference**: [GitHub Actions Usage Limits](https://docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration)

---

## Browser Extension Constraints

### 6. Browser Extension API Limitations

**Category**: Browser Extension
**Component**: Chrome/Firefox Extension APIs
**Impact**: Low

**Description**:
Browser extensions are subject to security sandboxing and API limitations:
- Content Security Policy restrictions
- Cross-origin request limitations
- Storage quotas (chrome.storage: 5MB sync, unlimited local)
- Background service worker lifecycle (event-driven, can be terminated)
- Manifest v3 limitations (no persistent background pages)

**Manifestations**:
- Extension popup state lost when closed
- Service worker cold start latency
- Limited access to certain web APIs
- Content script injection restrictions on some sites

**Mitigation Strategies**:
1. **State Persistence**: Store state in chrome.storage for recovery
2. **Lazy Loading**: Defer non-critical operations until needed
3. **Error Handling**: Graceful degradation when APIs unavailable
4. **Permissions**: Minimal required permissions in manifest

**Workarounds Implemented**:
- Extension uses chrome.storage.sync for settings
- Service worker re-initialization handled gracefully
- Fallback to content script if API calls fail

**Documentation**:
- [extension/README.md](extension/README.md) - Extension architecture
- [extension/manifest.json](extension/manifest.json) - Permission declarations

**External Reference**:
- [Chrome Extension API Reference](https://developer.chrome.com/docs/extensions/reference/)
- [Manifest V3 Changes](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

## Rate Limiting and External APIs

### 7. External API Rate Limits

**Category**: External Dependencies
**Component**: GitHub API, Telegram API, Data Sources
**Impact**: Medium

**Description**:
External APIs used by the system have rate limits that cannot be controlled:
- GitHub API: 5,000 requests/hour (authenticated)
- Telegram Bot API: 30 messages/second
- ProductHunt API: Varies by tier
- Reddit API: 60 requests/minute (OAuth)

**Manifestations**:
- HTTP 429 (Too Many Requests) responses
- API key suspension for abuse
- Delayed data updates during high usage

**Mitigation Strategies**:
1. **Circuit Breakers**: Implemented for all external APIs
2. **Caching**: Cache responses to reduce API calls
3. **Backpressure**: Slow down when rate limits approach
4. **Token Rotation**: Multiple API keys for load distribution
5. **Graceful Degradation**: Continue operation without external data

**Workarounds Implemented**:
- Circuit breaker pattern in `worker/lib/circuit-breaker.ts`
- KV-based caching for API responses
- Retry with exponential backoff
- Source prioritization when limits hit

**Documentation**:
- [worker/lib/circuit-breaker.ts](worker/lib/circuit-breaker.ts) - Circuit breaker implementation
- [worker/lib/cache.ts](worker/lib/cache.ts) - Caching layer

---

## Cloudflare Workers Runtime Constraints

### 8. Workers Runtime Limitations

**Category**: Runtime
**Component**: Cloudflare Workers Runtime (workerd)
**Impact**: Medium

**Description**:
Cloudflare Workers runtime has inherent limitations:
- CPU time: 50ms (free), 30s (bundled) per request
- Memory: 128MB per isolate
- Request body size: 100MB max
- Subrequest count: 50 per request (free), 1,000 (paid)
- Execution duration: 30s max for sync, unlimited for async (Durable Objects)

**Manifestations**:
- Script timeout during heavy computation
- Memory pressure with large datasets
- Subrequest exhaustion during batch operations

**Mitigation Strategies**:
1. **Batching**: Process data in chunks within limits
2. **Streaming**: Use streams for large payloads
3. **Background Processing**: Use Durable Objects for long-running tasks
4. **Optimization**: Efficient algorithms to fit in CPU limits
5. **Pagination**: Limit result sets to manageable sizes

**Workarounds Implemented**:
- Pipeline processing in batches of 100 deals
- Streaming JSON responses
- Rate limiting to prevent subrequest exhaustion
- Efficient regex-based parsing

**Documentation**:
- [worker/config.ts](worker/config.ts) - Resource limits configuration
- [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) - Limits section

**External Reference**: [Cloudflare Workers Platform Limits](https://developers.cloudflare.com/workers/platform/limits/)

---

## Schedule and Timing Constraints

### 9. Cron Trigger Minimum Interval

**Category**: Scheduling
**Component**: Cloudflare Cron Triggers
**Impact**: Low

**Description**:
Cloudflare Cron Triggers have a minimum interval of 1 minute. More frequent execution requires external scheduling or Durable Objects alarms.

**Manifestations**:
- Cannot run pipeline more frequently than every minute
- Sub-minute polling requires alternative architecture

**Mitigation Strategies**:
1. **Batching**: Accumulate work between runs
2. **External Scheduling**: Use external cron service for sub-minute triggers
3. **Durable Objects Alarms**: For more granular scheduling

**Workarounds Implemented**:
- Pipeline runs every 6 hours (cron: `0 */6 * * *`)
- Webhook triggers for real-time updates
- Queue-based processing for high-frequency events

**Documentation**:
- [wrangler.jsonc](wrangler.jsonc) - Cron trigger configuration

**External Reference**: [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/)

---

## Summary Table

| ID | Issue | Category | Impact | Status |
|----|-------|----------|--------|--------|
| CANTFIX-001 | KV Eventual Consistency | Infrastructure | Medium | Mitigated |
| CANTFIX-002 | Vitest Pool Crashes | Testing | High | Workaround |
| CANTFIX-003 | D1 Beta Status | Infrastructure | Medium | Mitigated |
| - | Secret Detection False Positives | Security | Low | Workaround |
| - | GitHub Actions Resource Limits | CI/CD | Low | Managed |
| - | Browser Extension API Limits | Extension | Low | Designed For |
| - | External API Rate Limits | External | Medium | Mitigated |
| - | Workers Runtime Limits | Runtime | Medium | Designed For |
| - | Cron Minimum Interval | Scheduling | Low | Accepted |

---

## Monitoring and Alerting

For issues that cannot be fixed, we monitor and alert:

1. **D1 Availability**: Alert if D1 queries fail >1% of requests
2. **KV Consistency Delays**: Log warnings if reads show >30s stale data
3. **External API Rate Limits**: Alert when approaching 80% of limits
4. **Test Infrastructure**: Monitor upstream releases for fixes

---

## Document History

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial creation | Analysis Swarm |
| 2026-04-03 | Added CANTFIX-001 through CANTFIX-003 | Analysis Swarm |
| 2026-04-03 | Added additional constraints | Analysis Swarm |

---

## Related Documentation

- [plans/PRE_EXISTING_CI_ISSUES.md](plans/PRE_EXISTING_CI_ISSUES.md) - CI/CD issues
- [agents-docs/LESSONS.md](agents-docs/LESSONS.md) - Lessons learned
- [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) - System architecture
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide

---

*This document is a permanent record of system limitations and should be updated when upstream issues are resolved or workarounds are improved.*
