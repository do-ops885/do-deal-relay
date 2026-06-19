# ADR-004: Enable Observability (Traces) and Document Edge Security

**Date**: 2026-05-16
**Status**: Active
**Strategy**: GOAP with parallel swarm coordination

## Context

The `do-deal-relay` worker currently has Cloudflare Workers observability configured but with traces disabled. Additionally, while the worker has solid in-code security middleware (API key auth, rate limiting, CORS, security headers), there's no documentation for Cloudflare platform-level edge security features (WAF, API Shield, DDoS protection).

## Decision

### 1. Enable Traces

Change `wrangler.jsonc` to enable `observability.traces.enabled: true` with `head_sampling_rate: 1` (100% sampling).

**Rationale**: Traces provide waterfall views of every request and subrequest, essential for debugging slow pipeline runs, D1 queries, and KV operations. Without traces, debugging requires manually adding timing logs.

### 2. Add head_sampling_rate to Logs

Add `head_sampling_rate: 1` to the logs observability config for consistency.

### 3. Document WAF & Edge Security

Add a new section `12. Edge Security Configuration` to `docs/DEPLOYMENT.md` covering:
- Cloudflare WAF (custom rules for SQLi/XSS blocking)
- API Shield & Schema Validation
- Rate Limiting (edge-level)
- Turnstile (CAPTCHA alternative)
- DDoS protection verification
- Bot Fight Mode

### 4. Close Stale Issues

Issues #237 and #238 are deployment failures from the fork environment (missing Cloudflare secrets and GH_TOKEN for releases). Close them with a clear explanation — they are expected failures, not real deployment bugs.

## Consequences

**Positive**:
- Full trace visibility for debugging production issues
- Complete edge security setup guide for operators
- Cleaner issue tracker (no stale fork-environment failures)

**Neutral**:
- Traces increase observability costs slightly (negligible at current scale)
- WAF/API Shield require Cloudflare dashboard actions — documented but not automated

## Implementation

Execution is tracked in [Sprint v0.1.5](sprint-v0.1.5.md) (P2 feature work: observability enablement, edge security documentation, close stale issues).
