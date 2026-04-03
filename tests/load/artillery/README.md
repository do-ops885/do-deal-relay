# Load Testing Suite

Production-grade load testing for the Deal Discovery API using Artillery.js.

## Overview

This directory contains load testing configurations and processors for testing the API under realistic production-level traffic patterns.

## Requirements (from production-readiness.md)

| Scenario | Target | Duration | Success Criteria |
|----------|--------|----------|------------------|
| API Endpoints | 1000 req/min | 10 min | p95 < 200ms, 0% errors |
| Webhooks | 100 concurrent | 5 min | 100% delivery, <500ms |
| KV Storage | 10,000 ops | varies | No rate limiting |

## Quick Start

```bash
# Run all load tests (requires running worker)
npm run test:load:all

# Run individual test suites
npm run test:load:api        # API endpoint tests
npm run test:load:webhook    # Webhook delivery tests
npm run test:load:kv         # KV storage tests

# Run smoke test (short, low load - for CI)
npm run test:load:smoke
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKER_URL` | Target worker URL | `http://localhost:8787` |
| `WEBHOOK_SECRET` | Secret for webhook signature | `test-secret` |
| `API_TOKEN` | API authentication token | `test-token` |

### CI vs Production

Tests are configured with CI-friendly defaults. For full production load testing:

```bash
# Full production load (10 minutes, 1000 req/min)
WORKER_URL=https://your-worker.workers.dev \
  npm run test:load:api

# Or use the -t flag directly
artillery run -t https://your-worker.workers.dev tests/load/artillery/api-endpoints.yml

# Increase webhook load to 100 concurrent
WORKER_URL=https://your-worker.workers.dev \
  npm run test:load:webhook

# Full KV test with 10,000 operations
WORKER_URL=https://your-worker.workers.dev \
  npm run test:load:kv
```

### Override Test Parameters

For quick tests or CI, you can override the duration and rate:

```bash
# Quick 30-second test at 5 req/sec
npm run test:load:quick

# Custom override
artillery run -t http://localhost:8787 \
  --overrides '{"config":{"phases":[{"duration":60,"arrivalRate":10}]}}' \
  tests/load/artillery/api-endpoints.yml
```

## Test Scenarios

### 1. API Endpoint Load Testing

**File**: `api-endpoints.yml`

Tests the following endpoints under sustained load:

- `GET /health` (40% of traffic)
- `GET /health/ready` (20% of traffic)
- `GET /health/live` (20% of traffic)
- `GET /metrics` (10% of traffic)
- `GET /deals` (10% of traffic)

**Phases**:
1. Warm-up: 30s @ 5 req/sec
2. Ramp up: 60s @ 5→17 req/sec (1000 req/min)
3. Sustained: 600s @ 17 req/sec
4. Cool-down: 30s @ 5 req/sec

**Success Criteria**:
- p95 latency < 200ms
- Error rate < 1%

### 2. Webhook Load Testing

**File**: `webhook.yml`

Tests concurrent webhook delivery with realistic payloads.

**Features**:
- 1KB average payload size
- HMAC signature generation
- Batch webhook delivery (20% of traffic)

**Phases**:
1. Ramp to 100 concurrent: 30s
2. Sustained 100 concurrent: 300s (5 min)
3. Ramp down: 30s

**Success Criteria**:
- 100% delivery success
- Average processing time < 500ms
- 0% error rate

### 3. KV Storage Load Testing

**File**: `kv-storage.yml`

Tests KV operations under high concurrency with realistic operation mix.

**Operation Mix**:
- 70% reads
- 25% writes
- 5% deletes

**Phases**:
1. Read-heavy workload: 120s @ 50 req/sec
2. Mixed workload: 180s @ 50 req/sec
3. Write burst: 60s @ 100 req/sec
4. Recovery: 60s @ 25 req/sec

**Success Criteria**:
- No rate limiting (429 responses)
- p95 latency < 100ms
- Error rate < 1%

## Test Processors

### webhook-processor.js

Generates realistic webhook payloads with:
- Random deal data
- HMAC signatures for security testing
- Configurable payload sizes (~1KB average)
- Batch payload generation

### kv-processor.js

Generates realistic KV operations with:
- Various payload sizes (100B - 2KB)
- TTL generation
- Key tracking for realistic read-after-write patterns
- Namespace distribution matching production

## Reports

Load test results are saved to `../../reports/load-tests/`:

```
reports/load-tests/
├── artillery-report-2024-01-15-*.json
└── artillery-report-*.json
```

Each report contains:
- Request latency percentiles (p50, p95, p99)
- Error rates
- Request throughput (RPS)
- Scenario-level metrics
- Custom counters and histograms

## Interpreting Results

### Success

```
All scenarios completed
p95 latency: 150ms ✓ (target: <200ms)
Error rate: 0.1% ✓ (target: <1%)
Throughput: 16.8 req/sec ✓ (target: 16.67)
```

### Failure Indicators

```
p95 latency: 450ms ✗ (exceeds 200ms threshold)
Error rate: 5% ✗ (exceeds 1% threshold)
Rate limited: Yes ✗ (KV or API limits hit)
```

## Troubleshooting

### Worker Not Responding

Ensure the worker is running:

```bash
npm run dev  # Local development
# or
curl $WORKER_URL/health  # Verify connectivity
```

### Rate Limiting

If hitting rate limits:
1. Check Cloudflare Workers limits in dashboard
2. Reduce concurrency in test config
3. Add delays between requests

### Memory Issues

For long-running tests:

```bash
# Run with increased memory
node --max-old-space-size=4096 \
  ./node_modules/.bin/artillery run api-endpoints.yml
```

## Integration with CI

Load tests are designed to run quickly in CI:

```yaml
# .github/workflows/load-test.yml (example)
name: Load Test

on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly at 2 AM

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:load:smoke
```

## Extending Tests

### Adding New Endpoints

Edit `api-endpoints.yml`:

```yaml
scenarios:
  - name: "New endpoint"
    weight: 10
    flow:
      - get:
          url: "/api/new-endpoint"
          expect:
            - statusCode: 200
```

### Custom Metrics

Add to processor files:

```javascript
events.emit('counter', 'my_metric', 1);
events.emit('histogram', 'my_latency', responseTime);
```

## References

- [Artillery Documentation](https://www.artillery.io/docs)
- [production-readiness.md](../../plans/production-readiness.md) - Original requirements
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits)
