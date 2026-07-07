# ADR-017: Durable Objects Migration for Core State

**Status**: Proposed
**Created**: 2026-07-07
**Version**: 0.1.8
**Decision Maker**: do-deal-relay Platform Team
**Type**: Architecture Migration

---

## Context

The pipeline relies on Cloudflare KV for distributed locking (`DEALS_LOCK`). KV provides **eventual consistency**, causing race conditions (P1-6, C-4 from audit). The current `acquireLock` (`worker/lib/lock.ts:25`) uses check-then-set — two concurrent cron triggers can both read "lock available" before either writes.

Durable Objects (DO) with SQLite storage reached **GA April 2025** (10GB/object). DOs provide single-threaded, globally-unique instances with strong consistency — no race condition possible.

---

## Decision Drivers

1. **P1-6 Lock Race**: KV eventual consistency allows duplicate pipeline runs
2. **Atomic Operations**: DO `transactionSync()` provides true atomicity without CAS workarounds
3. **Colocated Compute + State**: Zero-latency reads (code runs on same machine as SQLite)
4. **Zero-Idle-Cost**: DOs billed only on request duration (matches 6-hour cron schedule)
5. **PITR**: Point-in-time recovery for SQLite-backed DOs (30-day window)

---

## Current State

### KV Lock (`worker/lib/lock.ts`)

```
DEALS_LOCK KV → Key: "pipeline:lock", TTL-based expiry
├── check-then-set pattern (non-atomic)
├── 3 retries with 100ms backoff
└── Manual Date comparison for expiry
```

**Failure**: ~100ms race window between `get()` and `put()` allows concurrent acquisition.

---

## Target State

### PipelineLock DO — Atomic Concurrency

```typescript
// worker/durable-objects/pipeline-lock.ts
export class PipelineLock {
  private sql: SqlStorage;

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS locks (
        id TEXT PRIMARY KEY DEFAULT 'pipeline',
        run_id TEXT NOT NULL, trace_id TEXT NOT NULL,
        acquired_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
      )`);
  }

  async acquireLock(run_id: string, trace_id: string, ttl: number): Promise<boolean> {
    const now = Date.now();
    const expires = now + ttl * 1000;
    // Atomic: check expiry + insert in single transaction
    this.sql.exec(`
      INSERT INTO locks (id, run_id, trace_id, acquired_at, expires_at)
      SELECT 'pipeline', ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM locks WHERE id = 'pipeline' AND expires_at > ?
      )`, run_id, trace_id, now, expires, now);

    const row = this.sql.exec(`SELECT trace_id FROM locks WHERE id = 'pipeline'`).one();
    return row?.trace_id === trace_id;
  }

  async releaseLock(trace_id: string): Promise<void> {
    this.sql.exec(`DELETE FROM locks WHERE id = 'pipeline' AND trace_id = ?`, trace_id);
  }

  async getLockStatus() {
    const row = this.sql.exec(`SELECT * FROM locks WHERE id = 'pipeline'`).one();
    if (!row || row.expires_at <= Date.now()) return { locked: false };
    return { locked: true, run_id: row.run_id, trace_id: row.trace_id };
  }
}
```

### DealRegistry DO — Atomic Deal Operations

```typescript
// worker/durable-objects/deal-registry.ts
export class DealRegistry {
  private sql: SqlStorage;

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS deals (
        deal_id TEXT PRIMARY KEY, source TEXT NOT NULL,
        title TEXT NOT NULL, status TEXT DEFAULT 'candidate',
        data TEXT NOT NULL, created_at INTEGER, updated_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);`);
  }

  async stageDeals(deals: Array<{id: string; source: string; title: string; data: string}>) {
    const now = Date.now();
    for (const d of deals) {
      this.sql.exec(`INSERT OR REPLACE INTO deals VALUES (?,?,?,?,?,?,?)`,
        d.id, d.source, d.title, 'candidate', d.data, now, now);
    }
    return deals.length;
  }

  async publishDeals(dealIds: string[]) {
    const now = Date.now();
    for (const id of dealIds) {
      this.sql.exec(`UPDATE deals SET status='published', updated_at=? WHERE deal_id=? AND status='validated'`, now, id);
    }
  }
}
```

### SourceRegistry DO — Trust Score Management

```typescript
// worker/durable-objects/source-registry.ts
export class SourceRegistry {
  private sql: SqlStorage;

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        source_id TEXT PRIMARY KEY, trust_score REAL DEFAULT 0.5,
        total_deals INTEGER DEFAULT 0, successful_deals INTEGER DEFAULT 0,
        last_seen_at INTEGER, created_at INTEGER
      )`);
  }

  async evolveTrust(source_id: string, success: boolean) {
    const now = Date.now();
    this.sql.exec(`
      INSERT INTO sources VALUES (?,0.5,1,?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET
        total_deals=total_deals+1, successful_deals=successful_deals+?,
        trust_score=MIN(1.0,MAX(0.0,trust_score+(CASE WHEN ? THEN 0.05 ELSE -0.02 END))),
        last_seen_at=?
    `, source_id, now, now, success?1:0, success?1:0, success, now);
    const row = this.sql.exec(`SELECT trust_score FROM sources WHERE source_id=?`, source_id).one();
    return row?.trust_score ?? 0.5;
  }
}
```

---

## Migration Phases

### Phase 1: PipelineLock DO (1-2 days) — Fix P1-6

| Step | Action | Files |
|------|--------|-------|
| 1 | Add DO binding to wrangler | `wrangler.jsonc` |
| 2 | Create `worker/durable-objects/pipeline-lock.ts` | New |
| 3 | Unit tests with vitest-pool-workers | New test |
| 4 | Update `worker/lib/lock.ts` to use DO | `worker/lib/lock.ts` |
| 5 | Deploy staging, verify concurrent crons | Staging |
| 6 | Deploy production | Production |

**Rollback**: Revert `lock.ts` to KV. DO binding stays (unused).

### Phase 2: DealRegistry DO (2-3 days) — Atomic Deal Ops

| Step | Action | Files |
|------|--------|-------|
| 1 | Create `worker/durable-objects/deal-registry.ts` | New |
| 2 | Update pipeline phases to use DealRegistry | `worker/pipeline/*.ts` |
| 3 | Migrate data (KV → DO) | Migration script |
| 4 | Remove KV deal storage | `worker/lib/storage.ts` |

### Phase 3: SourceRegistry DO (1-2 days) — Atomic Trust

| Step | Action | Files |
|------|--------|-------|
| 1 | Create `worker/durable-objects/source-registry.ts` | New |
| 2 | Update `evolveSourceTrust` | `worker/lib/trust.ts` |
| 3 | Migrate source data (KV → DO) | Migration script |

---

## Wrangler Config

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "PIPELINE_LOCK", "class_name": "PipelineLock" },
      { "name": "DEAL_REGISTRY", "class_name": "DealRegistry" },
      { "name": "SOURCE_REGISTRY", "class_name": "SourceRegistry" }
    ]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["PipelineLock", "DealRegistry", "SourceRegistry"] }]
}
```

---

## Testing

```typescript
import { runDurableObjectAlarm } from "@cloudflare/vitest-pool-workers/testing";

it("prevents concurrent lock acquisition", async () => {
  const stub = env.PIPELINE_LOCK.getByName("pipeline");
  expect(await stub.acquireLock("run-1", "trace-1", 300)).toBe(true);
  expect(await stub.acquireLock("run-2", "trace-2", 300)).toBe(false);
  await stub.releaseLock("trace-1");
  expect(await stub.acquireLock("run-3", "trace-3", 300)).toBe(true);
});
```

| Test Type | Coverage |
|-----------|----------|
| Unit (DO isolation) | Each class |
| Concurrent lock | 10 parallel `acquireLock` |
| PITR restore | Bookmark + restore |
| Integration | Cron trigger e2e |

---

## Rollback

| Phase | Trigger | Action |
|-------|---------|--------|
| 1 (Lock) | Failures >1% | Revert to KV |
| 2 (Deals) | Deal loss >0 | Feature-flag KV reads |
| 3 (Sources) | Score drift | Feature-flag KV reads |

---

## Timeline & Cost

| Phase | Duration | Net Cost |
|-------|----------|----------|
| PipelineLock | 1-2 days | -$0.50/mo (remove KV) |
| DealRegistry | 2-3 days | +$0.05/mo (DO billing) |
| SourceRegistry | 1-2 days | +$0.01/mo |
| **Total** | **4-7 days** | **~-$0.44/mo** |

---

## Related Documents

- [worker/lib/lock.ts](../worker/lib/lock.ts) — Current KV lock
- [worker/state-machine.ts](../worker/state-machine.ts) — Pipeline state machine
- [agents-docs/KNOWN_ISSUES.md](../agents-docs/KNOWN_ISSUES.md) — CANTFIX-001
- [Cloudflare DO SQLite Docs](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)

---

*ADR generated from codebase analysis and Cloudflare Durable Objects docs (2026).*
