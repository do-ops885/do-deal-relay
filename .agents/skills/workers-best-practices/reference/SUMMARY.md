---
title: Workers Best Practices Summary
version: "1.0.0"
---

# Workers Best Practices - Quick Reference

This document provides a quick reference card for Cloudflare Workers best practices. For the full detailed guide, see [docs/BEST_PRACTICES.md](../../../docs/BEST_PRACTICES.md).

## Quick Reference Card

| Category | Critical Rule | Code Pattern |
|----------|---------------|--------------|
| **Security** | Use `crypto.randomUUID()` for IDs | `const id = crypto.randomUUID()` |
| **Security** | Use `timingSafeEqual` for secrets | `crypto.subtle.timingSafeEqual(a, b)` |
| **Performance** | Stream response bodies | `new Response(response.body, ...)` |
| **Performance** | Use `waitUntil()` for background work | `ctx.waitUntil(asyncOperation())` |
| **Type Safety** | Never use `as unknown as T` | Use type guards instead |
| **Type Safety** | Generate types with `wrangler types` | `npx wrangler types` |
| **Config** | Use `wrangler.jsonc` format | JSON with comments support |
| **Config** | Enable `nodejs_compat` flag | `"compatibility_flags": ["nodejs_compat"]` |
| **Error Handling** | Never use `passThroughOnException()` | Use explicit try/catch |
| **Error Handling** | Handle all Promise rejections | `.catch(err => log(err))` |
| **Observability** | Enable structured logging | JSON logs with correlation IDs |
| **Observability** | Set `observability.enabled: true` | In `wrangler.jsonc` |

## Most Critical Items Checklist

### Before Deploying to Production

- [ ] **IDs use crypto**: All ID generation uses `crypto.randomUUID()` not `Math.random()`
- [ ] **No double-casts**: Code contains no `as unknown as T` patterns
- [ ] **Secrets external**: All secrets in `wrangler secret`, not hardcoded
- [ ] **Streaming used**: Large responses streamed, not buffered with `.text()`
- [ ] **waitUntil applied**: Background work uses `ctx.waitUntil()`
- [ ] **Types generated**: `npx wrangler types` run and `Env` interface used
- [ ] **Config validated**: `wrangler.jsonc` has `nodejs_compat` and recent `compatibility_date`
- [ ] **Observability on**: Structured logging with correlation IDs enabled
- [ ] **No floating promises**: All Promises awaited, returned, or handled
- [ ] **Error handling explicit**: No `passThroughOnException()`, proper try/catch

### Security Critical

```typescript
// ✅ ID Generation
const id = crypto.randomUUID();

// ✅ Secret Comparison
import { timingSafeEqual } from 'node:crypto';
const isValid = timingSafeEqual(
  Buffer.from(received),
  Buffer.from(expected)
);

// ✅ Secret Access
const apiKey = env.API_KEY;  // From wrangler secret
```

### Performance Critical

```typescript
// ✅ Streaming
return new Response(response.body, {
  status: response.status,
  headers: response.headers
});

// ✅ Background Work
ctx.waitUntil(logToAnalytics(request));

// ✅ Bindings over REST
const value = await env.KV_NAMESPACE.get(key);
```

### Type Safety Critical

```typescript
// ✅ Type Guard
function isDeal(obj: unknown): obj is Deal {
  return obj && typeof obj === 'object' &&
         'id' in obj && 'title' in obj;
}

// ✅ Generated Types
import type { Env } from './worker-configuration';
```

## Full Guide Reference

| Document | Purpose | Location |
|----------|---------|----------|
| **Best Practices Guide** | Complete patterns and anti-patterns | [docs/BEST_PRACTICES.md](../../../docs/BEST_PRACTICES.md) |
| **Rules Reference** | All best practice rules with examples | [references/rules.md](./rules.md) |
| **Review Guide** | Type validation and review process | [references/review.md](./review.md) |
| **Skill Main** | How to use this skill | [SKILL.md](../SKILL.md) |

## Common Anti-Patterns Summary

| Anti-Pattern | Why It's Bad | Fix |
|--------------|------------|-----|
| `Math.random()` for tokens | Predictable, insecure | Use `crypto.randomUUID()` |
| `await response.text()` on large data | Memory exhaustion (128MB limit) | Stream with `response.body` |
| `as unknown as T` | Bypasses type safety | Use type guards |
| Hardcoded secrets | Credential leak risk | `wrangler secret put` |
| Floating promises | Swallowed errors, dropped results | `await`, `return`, or `waitUntil` |
| `passThroughOnException()` | Hides errors from monitoring | Explicit try/catch |
| Module-level request state | Cross-request data leaks | Store in request context |
| Empty catch blocks `.catch(() => {})` | Silent failures | Always log or handle |

## Quick Commands

```bash
# Generate types from wrangler config
npx wrangler types

# Validate before deploy
npx wrangler deploy --dry-run

# Set a secret
npx wrangler secret put SECRET_NAME

# Check wrangler config
npx wrangler config list
```

## Links

- [Full Best Practices Guide](../../../docs/BEST_PRACTICES.md)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
