# ADR-016: Centralized Security & Routing Middleware Architecture

**Status**: Proposed
**Created**: 2026-07-06
**Version**: 0.1.9
**Decision Maker**: do-deal-relay Platform Team
**Type**: Architecture & Security

---

## Context

Cross-referencing the April 2026 codebase audit (50 issues), swarm analysis (31 missing implementations), and current PROGRESS report reveals a recurring pattern: **security gaps and routing inconsistencies stem from ad-hoc handler registration without a unified middleware layer**.

### Current Problems

1. **Ad-hoc auth**: Each handler implements (or omits) its own authentication. D1 endpoints (H-3), `/api/submit` (M-7), and research endpoints have **no auth at all**.
2. **Scattered rate limiting**: `worker/lib/rate-limit.ts` defines endpoint-specific limits but they're **only enforced in MCP handlers**. Regular API routes bypass them entirely (M-8, H-4).
3. **Unregistered routes**: 10 webhook endpoints are fully implemented but **never wired into `index.ts`** (SWARM-C-2). The `reactivate` route handler exists but has no route registration.
4. **Manual route registration in `index.ts`**: Every new route requires hand-editing the monolithic `index.ts` with fragile regex matching. The deactivate route regex bug (P0-3, now fixed) was a symptom of this pattern.
5. **No request lifecycle hooks**: There's no centralized place to add logging, tracing, CORS, input validation, or EU AI Act compliance logging to all requests.

### Why Now

The P0 critical bugs are resolved. The next phase of work — P1 security hardening (D1 auth, API rate limiting, submit auth) — all require building auth/rate-limit mechanisms. Without a unified middleware layer, we'd replicate the same ad-hoc pattern and create more security gaps.

---

## Decision

**Adopt a centralized middleware architecture for all HTTP routes**, using a composable middleware pipeline inspired by Hono/Express patterns. Every route registered through the pipeline automatically inherits:

1. **Auth tier** (Public, API-Key, Internal/Admin)
2. **Rate limiting** (configuration-driven per endpoint)
3. **Input validation** (Zod schemas)
4. **Request logging & tracing** (EU AI Act compliance)
5. **CORS & security headers**

### Architecture

```typescript
// New: worker/lib/middleware/pipeline.ts

type AuthTier = 'public' | 'api-key' | 'internal';

interface RouteConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
  auth: AuthTier;
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
  validation?: {
    body?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
  };
  description: string;  // For auto-generated API docs
}

// Middleware pipeline applied to every route
const middlewareStack = [
  corsMiddleware,
  loggingMiddleware,
  tracingMiddleware,
  rateLimitMiddleware,
  authMiddleware,
  validationMiddleware,
];

// Route registration replaces hand-edited index.ts
registerRoutes([
  // Public routes
  { method: 'GET',  path: '/health', handler: handleHealth, auth: 'public', description: 'Health check' },
  { method: 'GET',  path: '/health/ready', handler: handleReady, auth: 'public', description: 'Readiness probe' },
  { method: 'GET',  path: '/health/live', handler: handleLive, auth: 'public', description: 'Liveness probe' },
  { method: 'GET',  path: '/metrics', handler: handleMetrics, auth: 'public', description: 'Prometheus metrics' },

  // API-key protected routes
  { method: 'POST', path: '/api/submit', handler: handleSubmit, auth: 'api-key',
    rateLimit: { windowMs: 60_000, maxRequests: 10 }, description: 'Submit a deal' },
  { method: 'POST', path: '/api/discover', handler: handleDiscover, auth: 'api-key',
    rateLimit: { windowMs: 60_000, maxRequests: 5 }, description: 'Trigger discovery' },
  { method: 'POST', path: '/api/research', handler: handleResearch, auth: 'api-key',
    rateLimit: { windowMs: 60_000, maxRequests: 5 }, description: 'Research a domain' },

  // Internal/admin routes
  { method: 'GET',  path: '/api/d1/search', handler: handleD1Search, auth: 'internal',
    rateLimit: { windowMs: 60_000, maxRequests: 30 }, description: 'D1 full-text search' },
  // ... all other D1 routes
  { method: 'POST', path: '/api/d1/migrations', handler: handleD1Migrations, auth: 'internal',
    rateLimit: { windowMs: 60_000, maxRequests: 5 }, description: 'Run D1 migrations' },

  // Webhook routes (currently unregistered)
  { method: 'POST', path: '/webhooks/incoming/:partnerId', handler: handleIncomingWebhook, auth: 'public',
    description: 'Receive incoming webhook from partner' },
  // ... all other webhook routes

  // Referral routes
  { method: 'POST', path: '/api/referrals/:code/deactivate', handler: handleDeactivateReferral, auth: 'api-key',
    description: 'Deactivate a referral code' },
  { method: 'POST', path: '/api/referrals/:code/reactivate', handler: handleReactivateReferral, auth: 'api-key',
    description: 'Reactivate a referral code' },
]);
```

### Auth Middleware Implementation

```typescript
// New: worker/lib/middleware/auth.ts

async function authMiddleware(
  request: Request,
  env: Env,
  config: RouteConfig
): Promise<Response | null> {
  switch (config.auth) {
    case 'public':
      return null; // Proceed

    case 'api-key':
      const apiKey = request.headers.get('X-API-Key');
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Missing X-API-Key header' }), { status: 401 });
      }
      const valid = await validateApiKey(env, apiKey);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401 });
      }
      return null;

    case 'internal':
      const internalKey = request.headers.get('X-Internal-Key');
      if (internalKey !== env.INTERNAL_API_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
      }
      return null;
  }
}
```

### Rate Limit Middleware Implementation

```typescript
// Enhanced: worker/lib/middleware/rate-limit.ts

async function rateLimitMiddleware(
  request: Request,
  env: Env,
  config: RouteConfig
): Promise<Response | null> {
  if (!config.rateLimit) return null;

  const key = `${config.path}:${getClientIP(request)}`;
  const current = await env.DEALS_LOCK.get(key);
  const now = Date.now();

  if (current) {
    const { count, resetAt } = JSON.parse(current);
    if (now < resetAt && count >= config.rateLimit.maxRequests) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((resetAt - now) / 1000),
      }), {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((resetAt - now) / 1000)) },
      });
    }
  }

  // Increment or reset counter
  const resetAt = now + config.rateLimit.windowMs;
  await env.DEALS_LOCK.put(key, JSON.stringify({
    count: current ? JSON.parse(current).count + 1 : 1,
    resetAt: current ? JSON.parse(current).resetAt : resetAt,
  }), { expirationTtl: Math.ceil(config.rateLimit.windowMs / 1000) });

  return null;
}
```

### Migration Strategy (Non-Breaking)

1. **Phase A**: Create the middleware pipeline alongside the existing `index.ts` router. Both coexist during migration.
2. **Phase B**: Migrate routes one group at a time (health → deals → referrals → D1 → webhooks → MCP), verifying CI passes at each step.
3. **Phase C**: Remove the old manual route registration from `index.ts` once all routes are migrated.
4. **Phase D**: Add the webhook routes that were previously unregistered.

---

## Consequences

### Positive

- **Zero-trust by default**: Every route explicitly declares its auth tier. No more "forgotten" auth.
- **Automatic rate limiting**: Rate limits are configuration, not an afterthought.
- **Self-documenting routes**: The route registry serves as a single source of truth for API documentation.
- **Safe route addition**: Adding a new route doesn't require fragile regex editing in `index.ts`.
- **Registers the 10 missing webhook endpoints** as part of the migration.
- **EU AI Act compliance**: Centralized logging ensures every request is tracked.

### Negative

- **Migration effort**: ~3-5 days to migrate all existing routes.
- **Middleware overhead**: Each middleware runs on every request (~1-2ms per layer).
- **Learning curve**: Team must learn the new pattern for adding routes.
- **Double maintenance during migration**: Both old and new routing exist temporarily.

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|:---|:---|:---|:---|
| Middleware breaks existing routes during migration | High | Medium | Phased migration; keep old router active; test each group in CI |
| Rate limit KV writes increase costs | Low | Medium | Use `DEALS_LOCK` (existing KV); set short TTLs |
| New auth breaks external integrations | Medium | Low | Document API key setup prominently; provide migration window |
| Internal key exposure | High | Low | Use `wrangler secret` for `INTERNAL_API_KEY`; never commit |

---

## Alternatives Considered

### Option A: Per-Handler Ad-hoc (Status Quo)
- **Pros**: No migration effort.
- **Cons**: Repeats the same mistakes. New endpoints will keep missing auth/rate-limiting. Not viable for P1 fixes.

### Option B: Express/Itty-Router Dependency
- **Pros**: Battle-tested routing libraries.
- **Cons**: Adds dependency weight to a Workers project. May not support Cloudflare-specific patterns (e.g., `ExecutionCtx`). **Rejected** — prefer lightweight custom pipeline.

### Option C: Hono Framework
- **Pros**: Designed for Cloudflare Workers; built-in middleware; type-safe.
- **Cons**: Requires adopting an entire framework; may conflict with existing patterns. **Deferred** — evaluate in a future ADR if middleware needs grow.

---

## Success Metrics

| Metric | Current | Target | Timeline |
|:---|:---|:---|:---|
| API endpoint auth coverage | 0% (D1, submit, research unprotected) | 100% of non-public endpoints | Phase 2 |
| Rate limiting coverage | MCP routes only | All API routes | Phase 2 |
| Webhook endpoints registered | 0/10 | 10/10 | Phase 1 |
| Route addition time | Manual `index.ts` edit + regex | One config entry | Phase 3 |
| EU AI Act logging coverage | Manual per-handler | Automatic via middleware | Phase 2 |

---

## Related Documents

- [GOAP_STATE.md](GOAP_STATE.md) — Prioritized inventory (P1-1, P1-2, P1-3, P1-4 depend on this ADR)
- [ADR-015](ADR-015-harness-cloudflare-2026-best-practices.md) — Harness & Cloudflare best practices
- [Codebase Audit](../reports/analysis/codebase-audit-2026-04-04.md) — Original audit with H-3, M-7, M-8
- [Swarm Analysis](../reports/analysis/swarm-missing-implementations-2026-04-04.md) — SWARM-C-2 webhook routes
- [KNOWN_ISSUES.md](../agents-docs/KNOWN_ISSUES.md) — Infrastructure constraints
- [SYSTEM_REFERENCE.md](../agents-docs/SYSTEM_REFERENCE.md) — Current system architecture

---

*ADR generated from cross-referencing April 2026 audit, swarm analysis, and PROGRESS-2026-07-02. The centralized middleware pattern is the single highest-leverage architectural change for unblocking P1 security hardening.*
