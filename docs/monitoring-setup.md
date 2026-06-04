# Monitoring & Observability Setup

This document describes the health, metrics, and alerting surface of the
`do-deal-relay` Cloudflare Worker, and how to wire it into an external
monitoring stack.

## 1. Health Endpoints

All health endpoints are unauthenticated and cache-friendly. Use them for
uptime checks, load balancer probes, and dependency dashboards.

| Endpoint        | Method | Purpose                                          | Typical use                       |
| --------------- | ------ | ------------------------------------------------ | --------------------------------- |
| `/health`       | GET    | Full system health with all dependency checks    | Operator dashboards, alerting     |
| `/health/ready` | GET    | Readiness probe (checks D1 connectivity)         | Kubernetes / load-balancer        |
| `/health/live`  | GET    | Liveness probe (process is up)                   | Kubernetes liveness               |
| `/metrics`      | GET    | Pipeline metrics (JSON or Prometheus text)       | Prometheus scraping, dashboards  |

`/health` returns a structured JSON payload with per-dependency latency and a
top-level `status` of `healthy`, `degraded`, or `unhealthy`. Each of the five
KV namespaces (`DEALS_PROD`, `DEALS_STAGING`, `DEALS_LOG`, `DEALS_LOCK`,
`DEALS_SOURCES`) plus the D1 binding are probed. The `pipeline` and `metrics`
sections include 24h run counts and success rates.

`/metrics` accepts a `?format=` query parameter:

- `format=prometheus` (default in the routing layer; the route accepts
  `prometheus`, `prom`, `text`, or `txt` as aliases) returns the
  Prometheus text format described below.
- `format=json` (or any other value) returns the legacy JSON funnel payload
  for backwards compatibility.

Example:

```bash
curl -fsS https://do-deal-relay.example.workers.dev/health
curl -fsS https://do-deal-relay.example.workers.dev/health/ready
curl -fsS https://do-deal-relay.example.workers.dev/health/live
curl -fsS https://do-deal-relay.example.workers.dev/metrics?format=prometheus
```

## 2. External Uptime Monitoring

The `/health/live` and `/health/ready` endpoints are intentionally cheap so
they can be polled every 15-30 seconds by a hosted uptime monitor.

### Checkly

1. Create a new **API Check**.
2. Method: `GET`. URL: `https://do-deal-relay.example.workers.dev/health/ready`.
3. Acceptable status codes: `200`.
4. Response body assertion (optional): `JSON.parse(body).ready === true`.
5. Check frequency: 30 seconds. Timeout: 5 seconds.
6. Add a second check against `/metrics?format=prometheus` with assertion
   `body.includes("pipeline_deals_published_total")` to catch silent
   regressions in the metrics pipeline.
7. Add an alert channel (Slack, PagerDuty, Opsgenie).

### UptimeRobot

1. Add a new **HTTP(s)** monitor.
2. URL: `https://do-deal-relay.example.workers.dev/health/live`.
3. Monitoring interval: 5 minutes for the free tier or 1 minute for Pro.
4. Alert contacts: email plus one webhook for the on-call rotation.

### Pingdom

1. Create a new **Uptime Check**.
2. URL: `https://do-deal-relay.example.workers.dev/health/ready`.
3. Check interval: 1 minute.
4. Set the **Request timeout** to 10 seconds.
5. Use the integrated alerting plus a **Custom HTTP check** against
   `/metrics?format=prometheus` with the same `pipeline_deals_published_total`
   string assertion as above.

## 3. Prometheus Integration

The Prometheus exporter is implemented in
`worker/lib/metrics/prometheus.ts` and is exposed through the
`/metrics?format=prometheus` endpoint. The `Content-Type` is set to
`text/plain; version=0.0.4; charset=utf-8` so any stock Prometheus scraper
accepts it.

### Scraping configuration

```yaml
scrape_configs:
  - job_name: do-deal-relay
    metrics_path: /metrics
    params:
      format: [prometheus]
    scheme: https
    static_configs:
      - targets:
          - do-deal-relay.example.workers.dev
    scrape_interval: 60s
    scrape_timeout: 15s
    honor_labels: true
```

The endpoint is wrapped by the existing `withAuth` admin gate, so the scrape
config must include the appropriate `Authorization` header (or a query-string
API key, depending on the deployment).

### Metric families

| Family                                | Type      | Labels             | Description                                              |
| ------------------------------------- | --------- | ------------------ | -------------------------------------------------------- |
| `pipeline_deals_discovered_total`     | counter   | `stage`            | Deals counted at each pipeline stage.                    |
| `pipeline_deals_published_total`      | counter   | -                  | Total deals published.                                   |
| `pipeline_errors_total`               | counter   | -                  | Errors observed during the run.                          |
| `pipeline_retries_total`              | counter   | -                  | Retries triggered during the run.                        |
| `pipeline_runs_total`                 | counter   | `success`          | Pipeline runs, labelled by success / failure.            |
| `pipeline_validation_cache_hit_rate`  | gauge     | -                  | `hits / (hits + misses)` for the validation cache.       |
| `pipeline_run_duration_seconds`       | gauge     | -                  | Total run duration in seconds.                           |
| `pipeline_phase_duration_seconds`     | histogram | `phase`, `le`      | Per-phase duration histogram (12 buckets + `+Inf`).      |

Missing data is emitted as `0` rather than skipped, so dashboards and alerts
remain stable across cold starts and fresh deployments.

## 4. Grafana Dashboard

Suggested queries for a single-row dashboard:

### Pipeline throughput (deals / run)

```promql
sum by (stage) (rate(pipeline_deals_discovered_total[1h]))
```

### Published deals per hour

```promql
increase(pipeline_deals_published_total[1h])
```

### Run success ratio (last 24h)

```promql
sum(rate(pipeline_runs_total{success="true"}[24h]))
  /
sum(rate(pipeline_runs_total[24h]))
```

### Validation cache effectiveness

```promql
pipeline_validation_cache_hit_rate
```

### p95 phase latency

```promql
histogram_quantile(
  0.95,
  sum by (phase, le) (rate(pipeline_phase_duration_seconds_bucket[10m]))
)
```

### Errors per hour

```promql
increase(pipeline_errors_total[1h])
```

Dashboard layout suggestion:

- Row 1: single-stat panels for published deals, success ratio, errors.
- Row 2: time series for discovered deals per stage.
- Row 3: time series for phase p50 / p95 / p99 latency stacked by phase.
- Row 4: gauge for validation cache hit rate and a table of run counts.

## 5. Alerting Rules

Suggested Prometheus alerting rules. Adjust thresholds after observing the
first 7-14 days of production data.

```yaml
groups:
  - name: do-deal-relay.rules
    interval: 30s
    rules:
      - alert: DealRelayDown
        expr: up{job="do-deal-relay"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "do-deal-relay is unreachable"
          description: "The Prometheus target has been down for 2 minutes."

      - alert: DealRelayHighErrorRate
        expr: |
          sum(rate(pipeline_errors_total[15m]))
            /
          (sum(rate(pipeline_runs_total[15m])) + 1)
            > 0.05
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Error ratio above 5% for 15 minutes"

      - alert: DealRelayNoRecentRuns
        expr: increase(pipeline_runs_total[30m]) == 0
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "No pipeline runs in the last 30 minutes"

      - alert: DealRelayPhaseLatencyP99
        expr: |
          histogram_quantile(
            0.99,
            sum by (phase, le) (rate(pipeline_phase_duration_seconds_bucket[10m]))
          ) > 5
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "p99 phase latency above 5s for 15 minutes"

      - alert: DealRelayHealthUnhealthy
        expr: probe_http_status_code{job="do-deal-relay-health"} != 200
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Health endpoint returning non-200 for 2 minutes"
```

Recommended severities:

- **Critical** pages the on-call engineer immediately. Reserved for full
  outages and unhealthy status from `/health`.
- **Warning** notifies the on-call channel but does not page. Used for error
  rates, slow phases, and missing runs.

## 6. On-Call Runbook

### Triage: deal discovery has stopped

1. Hit `/health` directly. Note the top-level `status` and the per-dependency
   statuses.
2. If D1 is unhealthy, run `wrangler d1 execute DEALS_DB --command "SELECT 1"`
   from a workstation with the admin secret to confirm.
3. If a specific KV namespace is unhealthy, check Cloudflare status and the
   `wrangler kv:list` output.
4. Inspect the recent pipeline runs through `/api/log` (admin auth) and look
   for repeated errors. The `pipeline_errors_total` metric should correlate.
5. If the lock is stuck, use `wrangler kv:key delete --binding=DEALS_LOCK
   "lock:discover"` to clear it; the next cron run will reacquire.

### Triage: high error rate

1. Query `pipeline_errors_total` for the last hour.
2. Pull the recent logs via `/api/log` and group by `phase` to find the
   failing step.
3. Common culprits: external source (Hacker News / Reddit) rate limited;
   snapshot hash mismatch (concurrent run).
4. If the failing phase is a known third party, temporarily disable the
   source via the source registry and open an issue.

### Triage: alert `DealRelayPhaseLatencyP99`

1. Query `pipeline_phase_duration_seconds` to identify the slow phase.
2. Check Cloudflare Workers analytics for cold starts in the same window.
3. If a single phase is consistently slow, drill into `/api/log` for that
   phase and look at the per-request latency breakdown.

### Communication template

```
INCIDENT: do-deal-relay [SEVERITY]
Status: investigating | identified | mitigated | resolved
Impact: <users / pipeline / no impact>
Current state: <short narrative>
Next update: <ISO-8601 timestamp>
```

Use this template in the on-call channel; replace `[SEVERITY]` with
`P1`/`P2`/`P3` so consumers can filter.
