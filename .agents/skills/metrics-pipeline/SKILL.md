---
name: metrics-pipeline
description: Prometheus-compatible metrics collection and export. Use for tracking performance, business metrics, custom counters, histograms, and monitoring system health.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# Metrics Pipeline

Collect, aggregate, and export Prometheus-compatible metrics.

## Quick Start

```typescript
import { MetricsPipeline, Counter, Histogram } from './metrics-pipeline';

const metrics = new MetricsPipeline({
  prefix: 'deal_system',
  labels: { env: 'production' }
});

const requestCount = metrics.counter('requests_total', 'Total requests');
const duration = metrics.histogram('duration_seconds', 'Request duration');

requestCount.inc();
duration.observe(0.5);
```

## Metric Types

| Type | Use Case | Example |
|------|----------|---------|
| Counter | Monotonically increasing | requests_total |
| Gauge | Arbitrary value | current_queue_size |
| Histogram | Distribution | request_duration |
| Summary | Quantile tracking | response_time |

## Usage

**Counter**:
```typescript
const dealsProcessed = metrics.counter(
  'deals_processed_total',
  'Total deals processed',
  ['source', 'status']
);

dealsProcessed.inc({ source: 'api', status: 'success' });
dealsProcessed.inc(5, { source: 'batch', status: 'success' });
```

**Gauge**:
```typescript
const queueSize = metrics.gauge(
  'queue_size',
  'Current queue size'
);

queueSize.set(100);
queueSize.inc();
queueSize.dec(5);
```

**Histogram**:
```typescript
const latency = metrics.histogram(
  'request_duration_seconds',
  'Request duration',
  [0.1, 0.5, 1, 2, 5, 10]
);

latency.observe(0.45);
```

**Summary**:
```typescript
const responseTime = metrics.summary(
  'response_time_seconds',
  'Response time',
  { quantiles: [0.5, 0.9, 0.99] }
);
```

## Labels

Dynamic dimensions:
```typescript
const httpRequests = metrics.counter(
  'http_requests_total',
  'HTTP requests',
  ['method', 'route', 'status']
);

httpRequests.inc({ method: 'GET', route: '/deals', status: '200' });
```

## Export Format

**Prometheus**:
```
# HELP deal_system_requests_total Total requests
# TYPE deal_system_requests_total counter
deal_system_requests_total{env="production"} 1000

# HELP deal_system_duration_seconds Request duration
# TYPE deal_system_duration_seconds histogram
deal_system_duration_seconds_bucket{le="0.1"} 100
deal_system_duration_seconds_bucket{le="0.5"} 500
```

## Collection

**Push Gateway**:
```typescript
await metrics.push('http://pushgateway:9091', {
  job: 'deal-worker'
});
```

**HTTP Endpoint**:
```typescript
app.get('/metrics', () => {
  return new Response(metrics.export(), {
    headers: { 'Content-Type': 'text/plain' }
  });
});
```

## Aggregation

**Time Windows**:
```typescript
const pipeline = new MetricsPipeline({
  aggregation: {
    window: 60000,  // 1 minute
    flushOn: ['count', 'time']
  }
});
```

**Batching**:
```typescript
const pipeline = new MetricsPipeline({
  batch: {
    size: 100,
    timeout: 5000
  }
});
```

## Custom Metrics

**Business Metrics**:
```typescript
const dealValue = metrics.gauge(
  'deal_value_dollars',
  'Deal value',
  ['category', 'source']
);

dealValue.set(50000, { category: 'saas', source: 'api' });
```

**SLI/SLO**:
```typescript
const availability = metrics.counter(
  'availability_total',
  'Availability check',
  ['result']
);

availability.inc({ result: 'success' });
availability.inc({ result: 'failure' });
// SLO: availability / total > 0.99
```

## Configuration

```typescript
interface MetricsConfig {
  prefix: string;
  labels: Record<string, string>;
  defaultBuckets?: number[];
  aggregation?: {
    window: number;
    flushOn: string[];
  };
  batch?: {
    size: number;
    timeout: number;
  };
}
```

## Best Practices

1. **Cardinality** - Limit label values (<100)
2. **Naming** - Use `snake_case` with units
3. **Help text** - Always add descriptions
4. **Base units** - Use seconds, bytes (not ms, MB)
5. **Histogram buckets** - Pre-defined, relevant to data

See [templates/metrics.ts](templates/metrics.ts) and [examples/prometheus-export.ts](examples/prometheus-export.ts) for complete examples.
