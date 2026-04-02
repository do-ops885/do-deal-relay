---
name: structured-logging
description: Correlation ID logging for distributed tracing. Use for request tracking, context propagation, log aggregation, and debugging across service boundaries.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# Structured Logging

Trace requests across services with correlation IDs and structured log entries.

## Quick Start

```typescript
import { Logger } from './structured-logging';

const logger = new Logger({
  correlationId: generateId(),
  service: 'deal-processor'
});

logger.info('Processing deal', { dealId: '123', value: 50000 });
// {"level":"info","time":"2024-01-15T...","correlationId":"abc123",
//  "service":"deal-processor","msg":"Processing deal","dealId":"123","value":50000}
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| Correlation ID | Traces request across services |
| Trace ID | Distributed trace identifier |
| Span ID | Operation within trace |
| Context | Shared attributes across logs |

## Usage

**Basic Logging**:
```typescript
const logger = new Logger({
  service: 'api-gateway',
  level: 'info'
});

logger.debug('Debug info');      // Hidden (level=info)
logger.info('Request received');
logger.warn('Rate limit approaching');
logger.error('Database connection failed', { error });
```

**With Correlation**:
```typescript
// On request entry
const correlationId = req.headers['x-correlation-id'] || generateId();
const logger = new Logger({ correlationId, service: 'api' });

// Pass to downstream
await fetch('http://service-b/api', {
  headers: { 'x-correlation-id': correlationId }
});
```

**Child Loggers**:
```typescript
const child = logger.child({ component: 'database' });
child.info('Query executed', { rows: 10 });
// Adds component: database to all logs
```

## Context Propagation

**Async Context**:
```typescript
import { AsyncLocalStorage } from 'async_hooks';

const asyncStorage = new AsyncLocalStorage<Logger>();

// Middleware
app.use((req, res, next) => {
  const logger = new Logger({ correlationId: req.id });
  asyncStorage.run(logger, next);
});

// Anywhere in call stack
const logger = asyncStorage.getStore();
logger.info('Doing work');
```

**Manual Pass**:
```typescript
async function processDeal(deal: Deal, logger: Logger) {
  logger.info('Processing', { dealId: deal.id });
  // Pass to helpers
  await validateDeal(deal, logger.child({ step: 'validate' }));
}
```

## Output Format

**JSON (default)**:
```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "correlationId": "abc123-def456",
  "traceId": "xyz789",
  "spanId": "span001",
  "service": "deal-processor",
  "msg": "Deal processed",
  "dealId": "deal-123",
  "durationMs": 150
}
```

**Pretty (dev)**:
```typescript
const logger = new Logger({
  format: 'pretty',
  colorize: true
});
// [10:30:00] INFO: Deal processed (dealId=deal-123, durationMs=150)
```

## Redaction

```typescript
const logger = new Logger({
  redact: ['password', 'token', 'apiKey', '*.secret']
});

logger.info('Login', { user: 'john', password: 'hunter2' });
// {"user":"john","password":"[REDACTED]"}
```

## Sampling

```typescript
const logger = new Logger({
  sample: {
    info: 1.0,     // 100%
    debug: 0.1,    // 10%
    trace: 0.01    // 1%
  }
});
```

## Integrations

**Cloudflare Workers**:
```typescript
export default {
  async fetch(req, env) {
    const logger = new Logger({
      correlationId: req.headers.get('x-correlation-id') || crypto.randomUUID()
    });

    logger.info('Request', { url: req.url });

    return new Response('OK');
  }
};
```

## Configuration

```typescript
interface LoggerConfig {
  service: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  correlationId?: string;
  traceId?: string;
  format: 'json' | 'pretty';
  redact?: string[];
  sample?: Record<string, number>;
  destination?: 'stdout' | 'file' | WritableStream;
}
```

## Best Practices

1. **Always use correlation IDs** - Essential for tracing
2. **Structured data** - Log objects, not strings
3. **Consistent keys** - Standardize field names
4. **Appropriate levels** - Error for problems, info for normal
5. **Don't log secrets** - Use redaction

See [templates/logger.ts](templates/logger.ts) and [examples/tracing.ts](examples/tracing.ts) for complete examples.
