# Best Practices Guide

Configuration and development best practices for Cloudflare Workers projects.

## Configuration

### Use wrangler.jsonc (not .toml)

- **JSONC format** allows comments for better documentation
- **Structured hierarchy** with proper nesting
- **Editor support** - better autocomplete and validation
- **Type safety** - can validate against JSON schema

```jsonc
// wrangler.jsonc - Preferred format
{
  "name": "my-worker",
  "compatibility_flags": ["nodejs_compat"],
  // Comments are allowed!
  "observability": {
    "enabled": true
  }
}
```

### Enable nodejs_compat Flag

Always enable `nodejs_compat` for modern Node.js API support:

```jsonc
{
  "compatibility_flags": ["nodejs_compat"]
}
```

This provides:
- `crypto` module APIs
- `Buffer` support
- Better npm package compatibility

### Set Compatibility Date

Use a recent compatibility date to access latest features:

```jsonc
{
  "compatibility_date": "2026-03-31"
}
```

### Enable Observability

Always configure observability for production monitoring:

```jsonc
{
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1  // Sample all requests (adjust for high traffic)
  }
}
```

### Secrets Management

- **Never** commit secrets to `wrangler.jsonc` or source code
- Use `wrangler secret put SECRET_NAME` for secrets
- Only non-sensitive variables in `vars`
- Regularly rotate secrets using `wrangler secret list` and `delete`

## Security

### Use crypto.randomUUID() for ID Generation

```typescript
// ✅ Good - cryptographically secure
const id = crypto.randomUUID();

// ❌ Bad - predictable, not secure
const id = Math.random().toString(36);
```

### Use timingSafeEqual for Secret Comparison

Prevent timing attacks when comparing secrets:

```typescript
import { timingSafeEqual } from 'node:crypto';

// ✅ Good - constant-time comparison
const isValid = timingSafeEqual(
  Buffer.from(receivedSecret),
  Buffer.from(expectedSecret)
);

// ❌ Bad - vulnerable to timing attacks
const isValid = receivedSecret === expectedSecret;
```

### Never Hardcode Secrets

```typescript
// ✅ Good - use environment bindings
const apiKey = env.API_KEY;  // Set via wrangler secret

// ❌ Bad - hardcoded secret
const apiKey = "sk-1234567890abcdef";
```

### Validate All Inputs

```typescript
// ✅ Good - validate and sanitize
function validateDeal(deal: unknown): Deal {
  if (!deal || typeof deal !== 'object') {
    throw new Error('Invalid deal format');
  }
  // Additional validation...
  return deal as Deal;
}
```

## Performance

### Stream Response Bodies

For large data, stream instead of buffering:

```typescript
// ✅ Good - streaming for large responses
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await fetch('https://api.example.com/large-data');
    // Stream directly without awaiting .text()
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
};

// ❌ Bad - buffers entire response
const text = await response.text();  // Memory intensive
```

### Use waitUntil() for Background Work

Don't block the response for non-critical work:

```typescript
// ✅ Good - fire-and-forget background tasks
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Log asynchronously
    ctx.waitUntil(logToAnalytics(request));

    // Return response immediately
    return new Response('OK');
  }
};
```

### Use Bindings, Not REST APIs

```typescript
// ✅ Good - use KV binding (fast, no network overhead)
const value = await env.DEALS_PROD.get(key);

// ❌ Bad - REST API (slower, consumes subrequests)
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`
);
```

### Minimize Subrequests

Keep external API calls minimal:

```typescript
// ✅ Good - batch requests
const results = await Promise.all([
  fetch(url1),
  fetch(url2),
  fetch(url3)
]);

// ❌ Bad - sequential requests (slow)
const r1 = await fetch(url1);
const r2 = await fetch(url2);
const r3 = await fetch(url3);
```

## Type Safety

### Never Use Double-Casts

```typescript
// ❌ Bad - bypasses type safety entirely
const result = unsafeData as unknown as Deal;

// ✅ Good - proper type guards
function isDeal(obj: unknown): obj is Deal {
  return obj && typeof obj === 'object' &&
         'id' in obj && 'title' in obj;
}

if (isDeal(data)) {
  // data is properly typed as Deal
}
```

### Use Wrangler Types for Env Interface

Generate types from wrangler configuration:

```bash
# Generate types from bindings
npx wrangler types
```

```typescript
// ✅ Good - use generated types
import type { Env } from './worker-configuration';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Full type safety for all bindings
    const value = await env.DEALS_PROD.get('key');
  }
};
```

### Enable Strict TypeScript

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## Error Handling

### Use Structured Logging

```typescript
// ✅ Good - structured logging with correlation IDs
interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  correlationId: string;
  context?: Record<string, unknown>;
}

function log(level: LogEntry['level'], message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    correlationId: crypto.randomUUID(),
    context
  };
  console.log(JSON.stringify(entry));
}

// ❌ Bad - unstructured console.log
console.log('Something happened');
```

### Never Use passThroughOnException

```typescript
// ❌ Bad - hides errors from monitoring
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    ctx.passThroughOnException();  // Don't do this!
    // ...
  }
};

// ✅ Good - explicit error handling
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // ... handler logic
    } catch (error) {
      // Log and return proper error response
      log('error', 'Request failed', { error: String(error) });
      return new Response('Internal Error', { status: 500 });
    }
  }
};
```

### Handle Promise Rejections

```typescript
// ✅ Good - always await or handle rejections
const promise = someAsyncOperation();
promise.catch(err => {
  log('error', 'Background operation failed', { error: err });
});

// Or use waitUntil for background work
ctx.waitUntil(someAsyncOperation().catch(err => {
  log('error', 'Background operation failed', { error: err });
}));
```

## Testing

### Test with Miniflare

```typescript
// test/setup.ts
import { Miniflare } from 'miniflare';

const mf = new Miniflare({
  scriptPath: './worker/index.ts',
  kvNamespaces: ['DEALS_PROD'],
  // Mock bindings
});

// Run tests against local Worker environment
```

### Mock Bindings in Tests

```typescript
// ✅ Good - properly typed mocks
const mockEnv: Env = {
  DEALS_PROD: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true })
  },
  // ... other bindings
};
```

## Deployment

### Use Environment-Specific Configs

```jsonc
// wrangler.jsonc
{
  "env": {
    "staging": {
      "name": "my-worker-staging",
      "vars": { "ENVIRONMENT": "staging" }
    },
    "production": {
      "name": "my-worker",
      "vars": { "ENVIRONMENT": "production" }
    }
  }
}
```

### Validate Before Deploy

```bash
# Always validate before deploying
npx wrangler deploy --dry-run
npx wrangler deploy --env staging  # Test in staging first
npx wrangler deploy --env production
```

### Version Your Deployments

Track versions in your repository:

```bash
# Tag releases
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3
```

## Resources

- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/learning/)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers Runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/)
- [TypeScript Support](https://developers.cloudflare.com/workers/languages/typescript/)
