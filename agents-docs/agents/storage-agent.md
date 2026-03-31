# Storage Agent

**Agent ID**: `storage-agent`
**Status**: ⚪ Pending  
**Scope**: KV storage layer, locking, logging, storage abstraction
**Previous Agent**: Bootstrap Agent  
**Next Agent**: Discovery Agent

## Input

From Bootstrap Agent:
- `worker/types.ts` - TypeScript interfaces
- `worker/config.ts` - Configuration constants
- Directory structure ready

## Deliverables

### Storage Layer
- [ ] `worker/lib/storage.ts` - KV abstraction
  - Production/staging snapshot operations
  - Source registry management
  - Deal queries (by ID, code, category)
  - Metadata operations

### Concurrency
- [ ] `worker/lib/lock.ts` - Distributed locking
  - Acquire/release lock
  - Lock extension
  - Lock status queries

### Logging
- [ ] `worker/lib/logger.ts` - Append-only JSONL
  - Log entry builder
  - Run log retrieval
  - Recent logs query
  - Export to JSONL

### Cryptography
- [ ] `worker/lib/crypto.ts` - Hashing utilities
  - SHA256 generation
  - Deal ID generation
  - Snapshot hash
  - UUID generation
  - Similarity calculations

## Interface Contract

### Storage Operations
```typescript
getProductionSnapshot(env: Env): Promise<Snapshot | null>
getStagingSnapshot(env: Env): Promise<Snapshot | null>
writeStagingSnapshot(env: Env, snapshot): Promise<Snapshot>
promoteToProduction(env: Env, expectedHash): Promise<Snapshot>
revertProduction(env: Env, previousSnapshot): Promise<void>
```

### Lock Operations
```typescript
acquireLock(env: Env, run_id, trace_id): Promise<boolean>
releaseLock(env: Env, trace_id): Promise<void>
extendLock(env: Env, trace_id, seconds): Promise<void>
getLockStatus(env: Env): Promise<LockStatus>
```

### Log Operations
```typescript
appendLog(env: Env, entry): Promise<void>
getRunLogs(env: Env, run_id): Promise<LogEntry[]>
getRecentLogs(env: Env, count): Promise<LogEntry[]>
exportLogsAsJSONL(env: Env): Promise<string>
```

## Handoff Checklist

Before handing to Discovery Agent:
- [ ] All storage operations tested
- [ ] Lock mechanism verified (TTL works)
- [ ] Logging writes to KV
- [ ] No circular dependencies

## Context for Next Agent

Discovery Agent needs:
1. Storage layer for saving discovered deals
2. Lock mechanism for concurrency
3. Logger for discovery phase

## Dependencies

- KV namespaces configured (placeholder IDs OK)
- Types and schemas defined
- Config constants available

## Blockers

None expected.
