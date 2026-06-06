---
name: workers-best-practices
description: Reviews and authors Cloudflare Workers code against production best practices. Load when writing new Workers, reviewing Worker code, configuring wrangler.jsonc, or checking for common Workers anti-patterns (streaming, floating promises, global state, secrets, bindings, observability). Biases towards retrieval from Cloudflare docs over pre-trained knowledge.
---

Your knowledge of Cloudflare Workers APIs, types, and configuration may be outdated. **Prefer retrieval over pre-training** for any Workers code task — writing or reviewing.

## Retrieval Sources

Fetch the **latest** versions before writing or reviewing Workers code. Do not rely on baked-in knowledge for API signatures, config fields, or binding shapes.

| Source | How to retrieve | Use for |
|--------|----------------|---------|
| Workers best practices | Fetch `https://developers.cloudflare.com/workers/best-practices/workers-best-practices/` | Canonical rules, patterns, anti-patterns |
| Workers types | See `references/review.md` for retrieval steps | API signatures, handler types, binding types |
| Wrangler config schema | `node_modules/wrangler/config-schema.json` | Config fields, binding shapes, allowed values |
| Cloudflare docs | Search tool or `https://developers.cloudflare.com/workers/` | API reference, compatibility dates/flags |

## FIRST: Fetch Latest References

Before reviewing or writing Workers code, retrieve the current best practices page and relevant type definitions. If the project's `node_modules` has an older version, **prefer the latest published version**.

```bash
# Fetch latest workers types
mkdir -p /tmp/workers-types-latest && \
  npm pack @cloudflare/workers-types --pack-destination /tmp/workers-types-latest && \
  tar -xzf /tmp/workers-types-latest/cloudflare-workers-types-*.tgz -C /tmp/workers-types-latest
# Types at /tmp/workers-types-latest/package/index.d.ts
```

## Reference Documentation

- `references/rules.md` — all best practice rules with code examples and anti-patterns
- `references/review.md` — type validation, config validation, binding access patterns, review process

## Rules Quick Reference

### Configuration

| Rule | Summary |
|------|---------|
| Compatibility date | Set `compatibility_date` to today on new projects; update periodically on existing ones |
| nodejs_compat | Enable the `nodejs_compat` flag — many libraries depend on Node.js built-ins |
| wrangler types | Run `wrangler types` to generate `Env` — never hand-write binding interfaces |
| Secrets | Use `wrangler secret put`, never hardcode secrets in config or source |
| wrangler.jsonc | Use JSONC config for non-secret settings — newer features are JSON-only |

### Request & Response Handling

| Rule | Summary |
|------|---------|
| Streaming | Stream large/unknown payloads — never `await response.text()` on unbounded data |
| waitUntil | Use `ctx.waitUntil()` for post-response work; do not destructure `ctx` |

### Architecture

| Rule | Summary |
|------|---------|
| Bindings over REST | Use in-process bindings (KV, R2, D1, Queues) — not the Cloudflare REST API |
| Queues & Workflows | Move async/background work off the critical path |
| Service bindings | Use service bindings for Worker-to-Worker calls — not public HTTP |
| Hyperdrive | Always use Hyperdrive for external PostgreSQL/MySQL connections |

### Observability

| Rule | Summary |
|------|---------|
| Logs & Traces | Enable `observability` in config with `head_sampling_rate`; use structured JSON logging |

### Code Patterns

| Rule | Summary |
|------|---------|
| No global request state | Never store request-scoped data in module-level variables |
| Floating promises | Every Promise must be `await`ed, `return`ed, `void`ed, or passed to `ctx.waitUntil()` |

### Security

| Rule | Summary |
|------|---------|
| Web Crypto | Use `crypto.randomUUID()` / `crypto.getRandomValues()` — never `Math.random()` for security |
| No passThroughOnException | Use explicit try/catch with structured error responses |

## Anti-Patterns to Flag

| Anti-pattern | Why it matters |
|-------------|----------------|
| `await response.text()` on unbounded data | Memory exhaustion — 128 MB limit |
| Hardcoded secrets in source or config | Credential leak via version control |
| `Math.random()` for tokens/IDs | Predictable, not cryptographically secure |
| Bare `fetch()` without `await` or `waitUntil` | Floating promise — dropped result, swallowed error |
| Module-level mutable variables for request state | Cross-request data leaks, stale state, I/O errors |
| Cloudflare REST API from inside a Worker | Unnecessary network hop, auth overhead, added latency |
| `ctx.passThroughOnException()` as error handling | Hides bugs, makes debugging impossible |
| Hand-written `Env` interface | Drifts from actual wrangler config bindings |
| Direct string comparison for secret values | Timing side-channel — use `crypto.subtle.timingSafeEqual` |
| Destructuring `ctx` (`const { waitUntil } = ctx`) | Loses `this` binding — throws "Illegal invocation" at runtime |
| `any` on `Env` or handler params | Defeats type safety for all binding access |
| `as unknown as T` double-cast | Hides real type incompatibilities — fix the design |
| `implements` on platform base classes (instead of `extends`) | Legacy — loses `this.ctx`, `this.env`. Applies to DurableObject, WorkerEntrypoint, Workflow |
| `env.X` inside platform base class | Should be `this.env.X` in classes extending DurableObject, WorkerEntrypoint, etc. |

## Review Workflow

1. **Retrieve** — fetch latest best practices page, workers types, and wrangler schema
2. **Read full files** — not just diffs; context matters for binding access patterns
3. **Check types** — binding access, handler signatures, no `any`, no unsafe casts (see `references/review.md`)
4. **Check config** — compatibility_date, nodejs_compat, observability, secrets, binding-code consistency
5. **Check patterns** — streaming, floating promises, global state, serialization boundaries
6. **Check security** — crypto usage, secret handling, timing-safe comparisons, error handling
7. **Validate with tools** — `npx tsc --noEmit`, lint for `no-floating-promises`
8. **Reference rules** — see `references/rules.md` for each rule's correct pattern

## Scope

This skill covers Workers-specific best practices and code review. For related topics:

- **Durable Objects**: load the `durable-objects` skill
- **Workflows**: see [Rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- **Wrangler CLI commands**: load the `wrangler` skill

## Principles

- **Be certain.** Retrieve before flagging. If unsure about an API, config field, or pattern, fetch the docs first.
- **Provide evidence.** Reference line numbers, tool output, or docs links.
- **Focus on what developers will copy.** Workers code in examples and docs gets pasted into production.
- **Correctness over completeness.** A concise example that works beats a comprehensive one with errors.

## Rationalizations

| Concern | Counter-Argument |
|---------|-----------------|
| Reviewing only the diff is faster than reading the full file. | Workers patterns are contextual — `env.X` access in a `fetch` handler is fine, the same expression in a Durable Object class is a bug. Diffs hide the class boundary. |
| Flagging style nits (semicolons, import ordering) is harmless. | Noise drowns signal. Reviewers (human or AI) start skimming, then miss the real issue. Reserve comments for things that affect correctness. |
| `as unknown as T` is a quick way to make a type error go away. | It hides the real mismatch. Fixing the underlying type is almost always possible and almost always reveals a real design flaw. |
| `any` on the `Env` interface is a small shortcut during prototyping. | Every binding access (`env.KV_NAMESPACE.get(...)`) becomes untyped. The shortcut costs hours the first time the binding name changes. |
| "It works locally" is good enough without checking `compatibility_date`. | The runtime behavior of bindings (Streaming, R2, Durable Objects) changes between dates. Pinning the date is the only way to know what shipped where. |

## Red Flags

- [ ] Do not flag an issue without a code reference (`file:line`) or a docs link.
- [ ] Do not recommend `as unknown as T` or `as any` casts — fix the type instead.
- [ ] Do not skip the `references/rules.md` lookup for any rule you cite.
- [ ] Do not review only the diff — read the surrounding class/module for context.
- [ ] Do not assume `compatibility_date` doesn't matter — it gates runtime behavior.
- [ ] Do not invent Worker APIs from memory; fetch `developers.cloudflare.com/workers` first.
- [ ] Do not use `implements DurableObject` — it must be `extends DurableObject` to retain `this.ctx` and `this.env`.
