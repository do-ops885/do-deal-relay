---
name: circuit-breaker
description: API resilience pattern for handling failures gracefully. Use for preventing cascade failures, automatic recovery, rate limiting, and protecting downstream services from overload.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# Circuit Breaker

Protect services from cascade failures with automatic detection and recovery.

## Quick Start

```typescript
import { CircuitBreaker } from './circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 3
});

const result = await breaker.fire(async () => {
  return await fetchExternalAPI();
});
```

## States

```
         ┌─────────────┐
   fail  │   CLOSED    │←──── success
  ┌──────│  (normal)   │
  │      └─────────────┘
  │            │ fail threshold
  │            ▼
  │      ┌─────────────┐
  │      │    OPEN     │
  │      │  (failing)  │────→ fallback
  │      └─────────────┘
  │            │
  │            │ timeout
  │            ▼
  │      ┌─────────────┐
  └─────→│ HALF-OPEN   │
  fail   │ (testing)   │←──── success
         └─────────────┘
```

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| failureThreshold | Failures to open | 5 |
| successThreshold | Successes to close | 3 |
| resetTimeout | Wait before testing | 30000ms |
| timeout | Request timeout | 10000ms |
| volumeThreshold | Min requests for calc | 10 |

## Usage

**Basic**:
```typescript
const breaker = new CircuitBreaker({
  name: 'payment-api',
  failureThreshold: 5,
  resetTimeout: 60000
});

const payment = await breaker.fire(() => processPayment(order));
```

**With Fallback**:
```typescript
const result = await breaker.fire(
  () => fetchPrimaryAPI(),
  () => fetchBackupAPI()  // Fallback
);
```

**With Events**:
```typescript
breaker.on('open', () => alerts.send('Circuit opened'));
breaker.on('close', () => alerts.send('Circuit closed'));
breaker.on('halfOpen', () => logger.info('Testing service'));
```

## Failure Detection

**Exception-based**:
```typescript
const breaker = new CircuitBreaker({
  isFailure: (error) => error.code >= 500
});
```

**Response-based**:
```typescript
const breaker = new CircuitBreaker({
  isFailure: (response) => !response.ok || response.took > 5000
});
```

**Sliding Window**:
```typescript
const breaker = new CircuitBreaker({
  window: { type: 'count', size: 10 },  // Last 10 calls
  errorThreshold: 0.5  // 50% error rate
});
```

## Bulkhead Pattern

Isolate resources per service:
```typescript
const bulkhead = new Bulkhead({
  maxConcurrent: 10,
  maxQueue: 100
});

await bulkhead.execute(async () => {
  // Max 10 concurrent
});
```

## Retry with Breaker

```typescript
const retryBreaker = new CircuitBreaker({
  retry: {
    max: 3,
    backoff: 'exponential',
    initialDelay: 100
  }
});
```

## Monitoring

```typescript
interface CircuitMetrics {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  rejects: number;
  lastFailureTime: number;
  failureRate: number;
}

const metrics = breaker.getMetrics();
```

## Multi-Circuit Setup

```typescript
const circuits = new CircuitRegistry();

circuits.register('api', { failureThreshold: 5 });
circuits.register('db', { failureThreshold: 3, resetTimeout: 60000 });

circuits.get('api').fire(() => fetchData());
```

## Configuration Interface

```typescript
interface BreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  resetTimeout: number;
  timeout?: number;
  isFailure?: (error: Error | Response) => boolean;
  onStateChange?: (state: State) => void;
  retry?: RetryConfig;
}
```

See [templates/breaker.ts](templates/breaker.ts) and [examples/api-protection.ts](examples/api-protection.ts) for implementations.
