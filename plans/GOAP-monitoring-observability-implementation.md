# GOAP Plan: Monitoring & Observability (Issue #277)

**Date**: 2026-06-03
**Strategy**: Sequential
**Agents**: 1 code-crafter, 1 general-purpose

## Context

Issue #277 identifies that production has no external monitoring, alerting, or observability. The service has basic health checks (`/health`, `/health/ready`, `/health/live`) and a metrics endpoint (`/metrics`), but lacks:
- External uptime monitoring
- Error tracking/aggregation
- Alerting for service degradation
- Comprehensive dependency health status

## Architecture Decision: Health Check Enhancement + External Monitoring

### ADR: Layered Health Check Architecture

**Decision**: Enhance existing health endpoints with dependency-specific checks and Prometheus-format metrics.

**Rationale**: The existing three-tier health pattern (`/health`, `/health/ready`, `/health/live`) is solid. We extend `/health` with detailed dependency status and add Prometheus-format `/metrics`.

**Health Response Format**:
```json
{
  "status": "healthy|degraded|unhealthy",
  "version": "1.2.3",
  "timestamp": "2026-06-03T12:00:00Z",
  "checks": {
    "d1": { "status": "healthy", "latency_ms": 12 },
    "kv_deals_prod": { "status": "healthy", "latency_ms": 5 },
    "kv_deals_staging": { "status": "healthy", "latency_ms": 4 },
    "kv_deals_log": { "status": "healthy", "latency_ms": 3 },
    "kv_deals_lock": { "status": "healthy", "latency_ms": 4 },
    "kv_deals_sources": { "status": "healthy", "latency_ms": 3 },
    "research_agent": { "status": "healthy", "circuit_breaker": "closed" },
    "mcp_server": { "status": "healthy", "tools_registered": 16 }
  },
  "uptime_seconds": 86400
}
```

### ADR: Prometheus-Compatible Metrics

**Decision**: Export metrics in Prometheus text format at `/metrics`.

**Rationale**: Prometheus is the industry standard for cloud-native observability. Cloudflare Analytics can supplement but not replace it.

**Metrics Categories**:
- **HTTP**: `http_requests_total`, `http_request_duration_seconds`
- **Pipeline**: `pipeline_runs_total`, `pipeline_deals_processed`, `pipeline_duration_seconds`
- **Research**: `research_requests_total`, `research_cache_hits`, `research_rate_limit_rejections`
- **Auth**: `auth_attempts_total`, `auth_failures_total`
- **System**: `system_uptime_seconds`, `system_memory_usage_bytes`

---

## Task Decomposition

### Sub-Goals

1. **Health Check Enhancement** - Priority: P1, Deps: none
2. **Metrics Export** - Priority: P1, Deps: 1
3. **Monitoring Documentation** - Priority: P1, Deps: 2

---

## Execution Plan

### Phase 3A: Health Check Enhancement

**Agent 1 → T3.1: Enhanced Health Checks**

Files to modify:
- `worker/routes/core/health.ts` - Add dependency checks
- `worker/routes/health.ts` - Update system health with detailed status

Tasks:
1. Add D1 connectivity check with latency measurement
2. Add KV namespace checks (all 5 namespaces) with latency
3. Add research agent circuit breaker status
4. Add MCP server tool count
5. Add uptime tracking
6. Return `healthy`/`degraded`/`unhealthy` based on dependency status
7. Add `Cache-Control: no-cache` header for health endpoints

Success Criteria:
- [ ] `/health` returns all dependency statuses
- [ ] Each check includes latency measurement
- [ ] Status is `healthy` when all deps OK, `degraded` when some fail
- [ ] Response time <200ms

---

### Phase 3B: Metrics Export

**Agent 1 → T3.2: Prometheus Metrics**

Files to create/modify:
- `worker/lib/metrics/prometheus.ts` (new) - Prometheus formatter
- `worker/lib/metrics/counters.ts` (modify) - Add HTTP/pipeline counters
- `worker/routes/core/health.ts` - Add `/metrics` endpoint handler

Tasks:
1. Create Prometheus text format encoder
2. Add HTTP request counters (method, path, status)
3. Add pipeline metrics (runs, deals processed, duration)
4. Add research metrics (requests, cache hits, rate limits)
5. Add auth metrics (attempts, failures)
6. Wire metrics into existing middleware/hooks
7. Add `/metrics` endpoint returning Prometheus format

Success Criteria:
- [ ] `/metrics` returns valid Prometheus text format
- [ ] Counters increment correctly
- [ ] Histograms track request duration
- [ ] No performance impact on hot path

---

### Phase 3C: Documentation

**Agent 2 → T3.3: Monitoring Setup Guide**

Files to create:
- `docs/monitoring-setup.md`

Tasks:
1. Document health check endpoint usage
2. Document metrics endpoint format
3. Create Checkly/Pingdom setup guide for uptime monitoring
4. Define alerting rules:
   - Health check failure >2 consecutive
   - Error rate >1%
   - Latency p99 >5s
   - No successful requests in 5 minutes
5. Document Grafana dashboard setup (if using Prometheus)
6. Add on-call rotation template

Success Criteria:
- [ ] Documentation covers all health endpoints
- [ ] External monitoring setup guide complete
- [ ] Alerting rules defined with thresholds
- [ ] On-call template included

---

## Quality Gate: Phase 3 Complete

- [ ] `/health` returns detailed dependency status
- [ ] `/metrics` returns valid Prometheus format
- [ ] Documentation complete
- [ ] No performance regression
- [ ] TypeScript compiles
- [ ] All tests pass

## Contingency

- If Prometheus format too complex: Use simple JSON metrics endpoint
- If external monitoring services unavailable: Document self-hosted options (Uptime Kuma)
