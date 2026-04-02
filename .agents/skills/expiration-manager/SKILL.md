---
name: expiration-manager
description: Time-based workflow management for scheduling and tracking expirations. Use for deal expiration tracking, scheduled notifications, TTL-based cleanup, and deadline management.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# Expiration Manager

Manage time-based workflows with automatic expiration tracking and notifications.

## Quick Start

```typescript
import { ExpirationManager } from './expiration-manager';

const manager = new ExpirationManager({
  storage: kv,           // KV or other storage
  notifyBefore: [86400, 3600],  // 24h, 1h before
  onExpire: (id) => handleExpiration(id)
});

// Schedule expiration
await manager.schedule('deal-123', {
  expiresAt: Date.now() + 86400000,  // 24 hours
  metadata: { dealId: '123', value: 50000 }
});
```

## Core Concepts

| Term | Description |
|------|-------------|
| TTL | Time-to-live in milliseconds |
| Expiration | Absolute timestamp when item expires |
| Grace Period | Additional time before cleanup |
| Notification | Alert before expiration |

## Scheduling

**Absolute Time**:
```typescript
await manager.schedule('item-1', {
  expiresAt: new Date('2024-12-31').getTime(),
  notifyBefore: [86400000, 3600000]  // 1 day, 1 hour
});
```

**Relative TTL**:
```typescript
await manager.schedule('item-2', {
  ttl: 3600000,  // 1 hour from now
  metadata: { type: 'session' }
});
```

**Recurring**:
```typescript
await manager.scheduleRecurring('cleanup-job', {
  interval: 86400000,  // Daily
  task: () => cleanupOldData()
});
```

## Notifications

**Before Expiration**:
```typescript
const manager = new ExpirationManager({
  notifyBefore: [86400000, 3600000, 60000],  // 24h, 1h, 1min
  onNotify: (id, notification, metadata) => {
    console.log(`Item ${id} expires in ${notification.before}ms`);
  }
});
```

**Expiration Handler**:
```typescript
const manager = new ExpirationManager({
  onExpire: async (id, metadata) => {
    await expireDeal(metadata.dealId);
    await sendExpirationEmail(metadata.userId);
  }
});
```

## Storage Backends

**Cloudflare KV**:
```typescript
const manager = new ExpirationManager({
  storage: 'kv',
  kv: env.EXPIRATIONS_KV,
  keyPrefix: 'exp:'
});
```

**Durable Objects**:
```typescript
const manager = new ExpirationManager({
  storage: 'do',
  alarm: (timestamp) => this.ctx.storage.setAlarm(timestamp)
});
```

**In-Memory**:
```typescript
const manager = new ExpirationManager({
  storage: 'memory'  // For testing/development
});
```

## Querying

**Get Expiring Items**:
```typescript
// Get items expiring in next hour
const expiring = await manager.getExpiring({
  before: Date.now() + 3600000,
  limit: 100
});
```

**Get Status**:
```typescript
const status = await manager.getStatus('item-1');
// { expiresAt: 1234567890, remaining: 3600000, notified: [86400000] }
```

## Lifecycle

```
scheduled → active → notify(24h) → notify(1h) → expired → cleanup
                ↓
              cancelled (if renewed)
```

## Renewal

**Extend Expiration**:
```typescript
// Add 24 hours
await manager.extend('item-1', { ttl: 86400000 });

// Set new absolute time
await manager.extend('item-1', { expiresAt: newExpiresAt });
```

**Cancel**:
```typescript
await manager.cancel('item-1');
// No expiration, no notifications
```

## Batch Operations

```typescript
// Schedule multiple
await manager.scheduleBatch([
  { id: 'a', expiresAt: t1 },
  { id: 'b', expiresAt: t2 }
]);

// Cancel multiple
await manager.cancelBatch(['a', 'b', 'c']);
```

## Configuration

```typescript
interface ExpirationConfig {
  storage: 'kv' | 'do' | 'memory' | StorageAdapter;
  notifyBefore?: number[];      // Milliseconds before
  gracePeriod?: number;         // Extra time after expiration
  onNotify?: (id, notif, meta) => void;
  onExpire?: (id, metadata) => void | Promise<void>;
  maxRetries?: number;          // For expiration handler
  retryDelay?: number;
}
```

## Best Practices

1. **Idempotent handlers** - Expiration may trigger multiple times
2. **Grace period** - Allow for clock skew
3. **Batch notifications** - Group nearby expirations
4. **Monitor lag** - Ensure expirations happen on time
5. **Test time travel** - Use time mocking in tests

See [templates/expiration.ts](templates/expiration.ts) and [examples/deal-tracking.ts](examples/deal-tracking.ts) for complete examples.
