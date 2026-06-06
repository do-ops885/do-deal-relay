---
name: durable-objects
description: Create and review Cloudflare Durable Objects. Use when building stateful coordination (chat rooms, multiplayer games, booking systems), implementing RPC methods, SQLite storage, alarms, WebSockets, or reviewing DO code for best practices. Covers Workers integration, wrangler config, and testing with Vitest. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.
---

# Durable Objects

Build stateful, coordinated applications on Cloudflare's edge using Durable Objects.

## Retrieval Sources

Your knowledge of Durable Objects APIs and configuration may be outdated. **Prefer retrieval over pre-training** for any Durable Objects task.

| Resource | URL |
|----------|-----|
| Docs | https://developers.cloudflare.com/durable-objects/ |
| API Reference | https://developers.cloudflare.com/durable-objects/api/ |
| Best Practices | https://developers.cloudflare.com/durable-objects/best-practices/ |
| Examples | https://developers.cloudflare.com/durable-objects/examples/ |

Fetch the relevant doc page when implementing features.

## When to Use

- Creating new Durable Object classes for stateful coordination
- Implementing RPC methods, alarms, or WebSocket handlers
- Reviewing existing DO code for best practices
- Configuring wrangler.jsonc/toml for DO bindings and migrations
- Writing tests with `@cloudflare/vitest-pool-workers`
- Designing sharding strategies and parent-child relationships

## Reference Documentation

- `./references/rules.md` - Core rules, storage, concurrency, RPC, alarms
- `./references/testing.md` - Vitest setup, unit/integration tests, alarm testing
- `./references/workers.md` - Workers handlers, types, wrangler config, observability

Search: `blockConcurrencyWhile`, `idFromName`, `getByName`, `setAlarm`, `sql.exec`

## Core Principles

### Use Durable Objects For

| Need | Example |
|------|---------|
| Coordination | Chat rooms, multiplayer games, collaborative docs |
| Strong consistency | Inventory, booking systems, turn-based games |
| Per-entity storage | Multi-tenant SaaS, per-user data |
| Persistent connections | WebSockets, real-time notifications |
| Scheduled work per entity | Subscription renewals, game timeouts |

### Do NOT Use For

- Stateless request handling (use plain Workers)
- Maximum global distribution needs
- High fan-out independent requests

## Quick Reference

### Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "durable_objects": {
    "bindings": [{ "name": "MY_DO", "class_name": "MyDurableObject" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MyDurableObject"] }]
}
```

### Basic Durable Object Pattern

```typescript
import { DurableObject } from "cloudflare:workers";

export interface Env {
  MY_DO: DurableObjectNamespace<MyDurableObject>;
}

export class MyDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data TEXT NOT NULL
        )
      `);
    });
  }

  async addItem(data: string): Promise<number> {
    const result = this.ctx.storage.sql.exec<{ id: number }>(
      "INSERT INTO items (data) VALUES (?) RETURNING id",
      data
    );
    return result.one().id;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const stub = env.MY_DO.getByName("my-instance");
    const id = await stub.addItem("hello");
    return Response.json({ id });
  },
};
```

## Critical Rules

1. **Model around coordination atoms** - One DO per chat room/game/user, not one global DO
2. **Use `getByName()` for deterministic routing** - Same input = same DO instance
3. **Use SQLite storage** - Configure `new_sqlite_classes` in migrations
4. **Initialize in constructor** - Use `blockConcurrencyWhile()` for schema setup only
5. **Use RPC methods** - Not fetch() handler (compatibility date >= 2024-04-03)
6. **Persist first, cache second** - Always write to storage before updating in-memory state
7. **One alarm per DO** - `setAlarm()` replaces any existing alarm

## Anti-Patterns (NEVER)

- Single global DO handling all requests (bottleneck)
- Using `blockConcurrencyWhile()` on every request (kills throughput)
- Storing critical state only in memory (lost on eviction/crash)
- Using `await` between related storage writes (breaks atomicity)
- Holding `blockConcurrencyWhile()` across `fetch()` or external I/O

## Stub Creation

```typescript
// Deterministic - preferred for most cases
const stub = env.MY_DO.getByName("room-123");

// From existing ID string
const id = env.MY_DO.idFromString(storedIdString);
const stub = env.MY_DO.get(id);

// New unique ID - store mapping externally
const id = env.MY_DO.newUniqueId();
const stub = env.MY_DO.get(id);
```

## Storage Operations

```typescript
// SQL (synchronous, recommended)
this.ctx.storage.sql.exec("INSERT INTO t (c) VALUES (?)", value);
const rows = this.ctx.storage.sql.exec<Row>("SELECT * FROM t").toArray();

// KV (async)
await this.ctx.storage.put("key", value);
const val = await this.ctx.storage.get<Type>("key");
```

## Alarms

```typescript
// Schedule (replaces existing)
await this.ctx.storage.setAlarm(Date.now() + 60_000);

// Handler
async alarm(): Promise<void> {
  // Process scheduled work
  // Optionally reschedule: await this.ctx.storage.setAlarm(...)
}

// Cancel
await this.ctx.storage.deleteAlarm();
```

## Testing Quick Start

```typescript
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("MyDO", () => {
  it("should work", async () => {
    const stub = env.MY_DO.getByName("test");
    const result = await stub.addItem("test");
    expect(result).toBe(1);
  });
});
```

## Rationalizations

| Concern | Counter-Argument |
|---------|-----------------|
| `implements DurableObject` should work like any other interface. | The class **must** `extends DurableObject` to inherit `this.ctx`, `this.env`, and the constructor that binds them. `implements` is a common migration mistake from pre-2024 DO types. |
| `this.env` and `this.ctx` look like class fields — calling `env.X` from inside a method should be equivalent. | Inside `extends DurableObject`, the inherited fields are `this.env` / `this.ctx`. Using the global `env` works in `fetch` handlers but not in DO methods. |
| `blockConcurrencyWhile()` is opt-in for performance. | Without it, the first request can race with `constructor` work and corrupt state. The default is "skip"; for any DO that initializes state in the constructor, you must wrap. |
| SQLite inside a DO is the same as Cloudflare D1. | D1 is the HTTP-fronted product; the DO SQLite (`this.ctx.storage.sql`) is per-DO with synchronous semantics, no HTTP overhead, and `transactional()` blocks. Using D1 APIs inside a DO is a layered mistake. |
| `getByName` and `idFromName` are equivalent shortcuts. | `getByName` is the one-call helper that resolves the ID *and* the stub. `idFromName` + `get` is the two-call form. Both work, but mixing them obscures intent. |
| Storing non-serializable values (Date, Map, Set) in `this.ctx.storage` should be fine. | The storage layer is JSON-serialized. `Date` becomes a string, `Map`/`Set` become `{}`/`[]`. Use `JSON.parse(JSON.stringify(...))` defensively or store ISO strings. |

## Red Flags

- [ ] Do not use `implements DurableObject` — must be `extends DurableObject` to retain `this.ctx`, `this.env`.
- [ ] Do not access the global `env` from inside a DO method; use `this.env` and `this.ctx`.
- [ ] Do not skip `blockConcurrencyWhile()` when the constructor mutates `this.ctx.storage`.
- [ ] Do not use D1 client APIs inside a DO — use `this.ctx.storage.sql` and `transactional()`.
- [ ] Do not store `Date`, `Map`, `Set`, or other non-JSON values directly in `this.ctx.storage` without explicit serialization.
- [ ] Do not call `getByName` on every request — IDs are stable; cache the stub in your Worker when possible.
