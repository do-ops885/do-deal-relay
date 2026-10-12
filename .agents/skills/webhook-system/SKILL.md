---
name: webhook-system
description: Event notifications with HMAC signature verification. Use for reliable webhook delivery, secure payload signing, retry logic, and event subscription management.
---

# Webhook System

Reliable event notifications with HMAC signature verification and retry logic.

## Quick Start

```typescript
import { WebhookSystem } from './webhook-system';

const webhooks = new WebhookSystem({
  secret: process.env.WEBHOOK_SECRET,
  retries: 3,
  timeout: 5000
});

// Send webhook
await webhooks.send({
  url: 'https://api.example.com/webhook',
  event: 'deal.created',
  payload: dealData
});
```

## Core Features

| Feature | Description |
|---------|-------------|
| HMAC Signing | SHA-256 payload verification |
| Retries | Exponential backoff with jitter |
| Timeouts | Configurable per-endpoint |
| Idempotency | Duplicate prevention |
| Batch Delivery | Multiple events per request |

## Sending Webhooks

**Single Event**:
```typescript
await webhooks.send({
  url: endpoint.url,
  event: 'deal.created',
  payload: { id: '123', value: 50000 },
  headers: { 'X-Custom': 'value' }
});
```

**Batch Events**:
```typescript
await webhooks.sendBatch({
  url: endpoint.url,
  events: [
    { type: 'deal.created', payload: deal1 },
    { type: 'deal.updated', payload: deal2 }
  ]
});
```

## Receiving Webhooks

**Verify Signature**:
```typescript
import { verifyWebhook } from './webhook-system';

app.post('/webhook', async (req) => {
  const isValid = verifyWebhook({
    secret: process.env.WEBHOOK_SECRET,
    signature: req.headers['x-signature'],
    payload: JSON.stringify(req.body)
  });

  if (!isValid) return new Response('Invalid', { status: 401 });

  await processEvent(req.body);
  return new Response('OK');
});
```

## Signature Format

```
X-Webhook-Signature: t=1234567890,v1=abc123...
```

- `t`: Timestamp (prevents replay)
- `v1`: HMAC-SHA256 signature

## Retry Configuration

```typescript
const webhooks = new WebhookSystem({
  retries: {
    max: 5,
    strategy: 'exponential',
    baseDelay: 1000,
    maxDelay: 60000,
    jitter: true
  }
});
```

## Event Types

```typescript
const events = [
  'deal.created',
  'deal.updated',
  'deal.expired',
  'deal.matched',
  'user.subscribed',
  'system.alert'
];
```

## Subscription Management

```typescript
const subscriptions = new SubscriptionManager();

// Subscribe
await subscriptions.subscribe({
  id: `sub_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
  url: 'https://api.example.com/webhook',
  events: ['deal.created', 'deal.updated'],
  secret: generateSecret()
});

// Unsubscribe
await subscriptions.unsubscribe('sub-1');
```

## Delivery Status

```typescript
interface Delivery {
  id: string;
  subscriptionId: string;
  event: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: Attempt[];
  createdAt: number;
}

interface Attempt {
  timestamp: number;
  statusCode: number;
  responseTime: number;
  error?: string;
}
```

## Security Best Practices

1. **HTTPS only** - Never send over HTTP
2. **Secret rotation** - Regular key rotation
3. **Timestamp validation** - Reject old requests (>5min)
4. **IP allowlist** - Restrict sender IPs
5. **Payload limits** - Max size enforcement

## Webhook Verification

```typescript
function verifyWebhook({
  secret,
  signature,
  payload,
  tolerance = 300  // 5 minutes
}: VerifyOptions): boolean {
  const [t, v1] = parseSignature(signature);

  // Check timestamp
  if (Math.abs(Date.now()/1000 - t) > tolerance) {
    return false;
  }

  // Verify signature
  const expected = crypto.createHmac('sha256', secret)
    .update(`${t}.${payload}`)
    .digest('hex');

  return timingSafeEqual(v1, expected);
}
```

## Configuration

```typescript
interface WebhookConfig {
  secret: string;
  retries: number | RetryConfig;
  timeout: number;
  maxPayloadSize: number;
  allowedIPs?: string[];
  requireHttps: boolean;
}
```

See [templates/webhook.ts](templates/webhook.ts) and [examples/event-delivery.ts](examples/event-delivery.ts) for complete implementations.

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "The partner ID in the path is enough to authenticate the sender." | `/webhooks/incoming/:partnerId` is a public route; `worker/routes/webhooks/incoming.ts` verifies the HMAC at the request boundary as defense-in-depth because an ID is an identifier, not a secret. |
| "Loosen the timestamp window so retried deliveries still pass." | `verifyHmacSignature` in `worker/lib/hmac.ts` rejects skew beyond 300s to block replays; widening the window makes every captured request reusable. |
| "Best-effort delivery is fine; a dropped event is acceptable." | `worker/lib/webhook/delivery.ts` routes failed attempts to the Dead Letter Queue with a 30-day TTL; swallowing them breaks the DLQ contract and leaves the partner blind. |
| "I will POST wherever the subscriber points." | `worker/routes/webhooks/subscriptions.ts` runs `validateFetchUrl` on endpoint URLs; skipping it reopens SSRF against private address space. |

## Red Flags

- [ ] Body processed before the signature/timestamp headers are checked.
- [ ] Subscription endpoint stored without `validateFetchUrl` or an HTTPS requirement.
- [ ] Delivery marked delivered on a non-2xx response, or a failed attempt never enqueued to the DLQ.
- [ ] `Idempotency-Key` ignored, so a retried event is handled twice.
- [ ] Signature compared with plain string equality instead of the timing-safe helper in `worker/lib/hmac.ts`.
