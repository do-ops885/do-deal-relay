# Observability and Monitoring Guide

This document outlines the monitoring, alerting, and observability infrastructure for the Deal Discovery System.

## Monitoring Strategy

We use a multi-layered approach to ensure service reliability:

1.  **Error Tracking:** Sentry for exception aggregation and alerting.
2.  **Health Checks:** `/health` endpoint for dependency and system status.
3.  **Uptime Monitoring:** External probes to verify service availability.
4.  **Metrics:** Prometheus-compatible metrics for performance and throughput tracking.

---

## 1. Error Tracking (Sentry)

The system is integrated with Sentry to capture runtime errors in both `fetch` and `scheduled` handlers.

### Configuration
Set the `SENTRY_DSN` environment variable in your production environment:
```bash
wrangler secret put SENTRY_DSN
```

### Usage
Errors are automatically captured. Manual capture is available via the global error handler:
```typescript
import { handleError } from "./lib/error-handler";

try {
  // ... code
} catch (e) {
  handleError(e, { component: "my-component" });
}
```

---

## 2. Health Checks

The system provides three health endpoints:

-   `GET /health`: Detailed health check including D1 and KV connection status. Returns `200 OK` if healthy, `503 Service Unavailable` if critical dependencies are down.
-   `GET /health/ready`: Alias for `/health` used by load balancers.
-   `GET /health/live`: Simple liveness check that returns `200 OK` if the worker is running.

---

## 3. External Uptime Monitoring

We recommend using an external service like **Cloudflare Health Checks**, **Checkly**, or **Pingdom** to monitor the `/health` endpoint.

### Configuration (e.g., Checkly)
-   **URL:** `https://your-worker.workers.dev/health`
-   **Frequency:** Every 1 minute.
-   **Assertion:** Status code is `200`.
-   **Alerting:** Notify on 2 consecutive failures.

---

## 4. Metrics and Alerting

Metrics are available at `GET /metrics` (Admin authentication required).

### Key Metrics
| Metric | Description |
| :--- | :--- |
| `deals_pipeline_success_rate` | Success rate of the discovery pipeline. |
| `deals_pipeline_last_success_timestamp_seconds` | Timestamp of the last successful run. |
| `stage_latency_ms` | Latency per pipeline stage (discovery, validation, publish). |
| `deals_pipeline_errors_total` | Total number of pipeline errors. |

### Recommended Alerting Rules
Configure these alerts in your monitoring tool (e.g., Grafana, Cloudflare Alerts):

1.  **Service Down:** `up == 0` or `/health` returns non-200 for > 2 minutes.
2.  **High Error Rate:** `rate(deals_pipeline_errors_total[5m]) > 1%` of total requests.
3.  **High Latency:** `stage_latency_ms{percentile="p99"} > 5000` (5 seconds).
4.  **Stale Data:** `time() - deals_pipeline_last_success_timestamp_seconds > 21600` (No success in 6 hours).

---

## 5. Dashboards

A basic metrics dashboard can be constructed using the Prometheus-compatible data from `/metrics`. For high-level analytics, use the `/api/analytics` endpoint.
