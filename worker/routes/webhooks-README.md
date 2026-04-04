# Webhook System for Partner Integrations

A secure, reliable webhook system for managing referral codes through partner integrations. Supports bidirectional sync with HMAC-SHA256 signature verification, idempotency, and automatic retry logic.

## Features

- **HMAC-SHA256 Security**: Cryptographically verified webhook signatures
- **URL Preservation**: Complete URLs maintained throughout the pipeline (CRITICAL)
- **Idempotency**: Prevent duplicate processing with idempotency keys
- **Retry Logic**: Exponential backoff with up to 5 retries
- **Dead Letter Queue**: Failed webhooks can be reviewed and replayed
- **Rate Limiting**: Per-partner rate limits with configurable tiers
- **Bidirectional Sync**: Two-way synchronization with partner systems

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Partner Systems                                 │
│  Trading Platform    E-commerce Site     SaaS App       Affiliate Net     │
│       │                  │                   │                  │           │
│       └──────────────────┴───────────────────┴──────────────────┘           │
│                              │                                              │
│                              │ POST /webhooks/incoming/:partner            │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   HMAC Verification │
                    │   Rate Limit Check  │
                    │   Idempotency Check │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Event Processor   │
                    │  • Create Referral  │
                    │  • Update Status    │
                    │  • Deactivate Code  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Outgoing Webhooks  │
                    │  • Broadcast Events │
                    │  • Retry Logic      │
                    │  • DLQ Management   │
                    └─────────────────────┘
```

## Quick Start

### 1. Create a Partner

```bash
curl -X POST https://api.example.com/webhooks/partners \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "name": "Trading212",
    "allowed_events": ["referral.created", "referral.deactivated"],
    "rate_limit_per_minute": 100
  }'
```

Response:

```json
{
  "success": true,
  "partner": {
    "id": "partner_abc123",
    "name": "Trading212",
    "secret": "whsec_a1b2c3d4e5f6...",
    "active": true,
    "allowed_events": ["referral.created", "referral.deactivated"],
    "rate_limit_per_minute": 100,
    "created_at": "2024-04-01T12:00:00Z"
  }
}
```

**Important**: Store the `secret` securely - it's only shown once!

### 2. Subscribe to Outgoing Webhooks

```bash
curl -X POST https://api.example.com/webhooks/subscribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "partner_id": "partner_abc123",
    "url": "https://partner.com/webhooks/deals",
    "events": ["referral.created", "referral.validated"],
    "filters": {
      "domains": ["trading212.com"]
    },
    "retry_policy": {
      "max_attempts": 5,
      "initial_delay_ms": 1000,
      "backoff_multiplier": 2
    }
  }'
```

### 3. Send Incoming Webhook

```javascript
import crypto from "crypto";

const WEBHOOK_SECRET = "whsec_a1b2c3d4e5f6...";
const PARTNER_ID = "partner_abc123";

async function sendReferralWebhook() {
  const payload = JSON.stringify({
    event: "referral.created",
    data: {
      code: "GcCOCxbo",
      url: "https://trading212.com/invite/GcCOCxbo", // FULL URL!
      domain: "trading212.com",
      title: "Get a Free Share",
      reward: {
        type: "item",
        value: "Free share worth up to £100",
        currency: "GBP",
      },
      expires_at: "2024-12-31T23:59:59Z",
    },
    external_id: "t212_ref_12345",
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;

  const signature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  const response = await fetch(
    `https://api.example.com/webhooks/incoming/${PARTNER_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Timestamp": timestamp.toString(),
        "X-Webhook-Id": `wh_${Date.now()}`,
        "Idempotency-Key": "unique-key-123", // Optional but recommended
      },
      body: payload,
    },
  );

  const result = await response.json();
  console.log(result);
  // { success: true, referral_id: 'ref_xxx', message: 'Referral created successfully' }
}
```

## API Endpoints

### Incoming Webhooks (Partners → Us)

| Method | Endpoint                      | Description                  |
| ------ | ----------------------------- | ---------------------------- |
| POST   | `/webhooks/incoming/:partner` | Receive webhook from partner |

**Required Headers:**

- `Content-Type: application/json`
- `X-Webhook-Signature`: HMAC-SHA256 signature
- `X-Webhook-Timestamp`: Unix timestamp (seconds)
- `X-Webhook-Id`: Unique event identifier

**Optional Headers:**

- `Idempotency-Key`: Prevent duplicate processing

### Subscription Management

| Method | Endpoint                                 | Description         |
| ------ | ---------------------------------------- | ------------------- |
| POST   | `/webhooks/subscribe`                    | Create subscription |
| POST   | `/webhooks/unsubscribe`                  | Delete subscription |
| GET    | `/webhooks/subscriptions?partner_id=xxx` | List subscriptions  |

### Partner Management

| Method | Endpoint                 | Description      |
| ------ | ------------------------ | ---------------- |
| POST   | `/webhooks/partners`     | Create partner   |
| GET    | `/webhooks/partners/:id` | Get partner info |

### Dead Letter Queue

| Method | Endpoint                                   | Description        |
| ------ | ------------------------------------------ | ------------------ |
| GET    | `/webhooks/dlq`                            | List failed events |
| POST   | `/webhooks/dlq/:event_id/:subscription_id` | Retry event        |

### Sync Management

| Method | Endpoint                     | Description        |
| ------ | ---------------------------- | ------------------ |
| POST   | `/webhooks/sync`             | Create sync config |
| GET    | `/webhooks/sync/:partner_id` | Get sync state     |

## Event Types

### Incoming Events (Partners send to us)

| Event                  | Description       | Required Fields         |
| ---------------------- | ----------------- | ----------------------- |
| `referral.created`     | New referral code | `code`, `url`, `domain` |
| `referral.updated`     | Update existing   | `code`, `url`, `domain` |
| `referral.deactivated` | Deactivate code   | `code`                  |
| `referral.expired`     | Mark as expired   | `code`                  |
| `ping`                 | Health check      | -                       |

### Outgoing Events (We send to partners)

| Event                  | Description                |
| ---------------------- | -------------------------- |
| `referral.created`     | New referral added         |
| `referral.validated`   | Referral passed validation |
| `referral.quarantined` | Referral failed validation |
| `referral.deactivated` | Referral deactivated       |
| `referral.expired`     | Referral expired           |

## SDK Usage

### TypeScript/JavaScript SDK

```typescript
import { WebhookClient, WebhookServer } from "./webhook-sdk";

// Sending webhooks (as a partner)
const client = new WebhookClient({
  baseUrl: "https://api.example.com/webhooks/incoming/my-partner",
  secret: "whsec_xxx",
  partnerId: "my-partner",
});

// Send referral created event
await client.sendReferralCreated({
  code: "ABC123",
  url: "https://example.com/invite/ABC123", // FULL URL
  domain: "example.com",
  reward: { type: "percent", value: 20 },
});

// Receiving webhooks (as a partner)
const server = new WebhookServer({ secret: "whsec_xxx" });

app.post("/webhooks", async (req, res) => {
  try {
    const event = await server.verifyAndParse(req.body, req.headers);

    // URL is always complete
    console.log(event.data.url); // https://example.com/invite/ABC123

    res.status(200).send("OK");
  } catch (error) {
    res.status(401).send("Invalid signature");
  }
});
```

## URL Preservation (CRITICAL)

**Always use complete URLs with protocol:**

```javascript
// CORRECT
{
  "url": "https://picnic.app/de/freunde-rabatt/DOMI6869"
}

// WRONG - Never do this
{
  "url": "picnic.app/DOMI6869"  // Missing protocol!
}
```

The system validates URLs to ensure they are complete. Incomplete URLs will be rejected with a 400 error.

## Security

### HMAC-SHA256 Signature

Signatures are generated using:

```
signature = HMAC-SHA256(secret, timestamp.payload)
```

Where:

- `secret`: Partner-specific webhook secret
- `timestamp`: Unix timestamp in seconds
- `payload`: Raw request body

### Timestamp Validation

Webhooks must be received within 5 minutes of the timestamp to prevent replay attacks.

### Rate Limiting

| Tier       | Requests/Min | Burst |
| ---------- | ------------ | ----- |
| Free       | 60           | 10    |
| Basic      | 300          | 50    |
| Pro        | 1,000        | 200   |
| Enterprise | 5,000        | 500   |

### Response Codes

| Code | Meaning      | Action             |
| ---- | ------------ | ------------------ |
| 200  | Success      | No retry           |
| 201  | Created      | No retry           |
| 400  | Bad Request  | No retry           |
| 401  | Unauthorized | No retry           |
| 409  | Duplicate    | No retry           |
| 429  | Rate Limited | Retry with backoff |
| 500  | Server Error | Retry with backoff |

## Retry Logic

Failed webhooks are retried with exponential backoff:

| Attempt | Delay (base 1000ms, multiplier 2) |
| ------- | --------------------------------- |
| 1       | ~1000ms + jitter                  |
| 2       | ~2000ms + jitter                  |
| 3       | ~4000ms + jitter                  |
| 4       | ~8000ms + jitter                  |
| 5       | ~16000ms + jitter                 |

After 5 failed attempts, the event goes to the Dead Letter Queue.

## Bidirectional Sync

Configure two-way synchronization with partners:

```bash
curl -X POST https://api.example.com/webhooks/sync \
  -H "Content-Type: application/json" \
  -d '{
    "partner_id": "partner_abc123",
    "direction": "bidirectional",
    "mode": "scheduled",
    "schedule": {
      "cron": "0 */6 * * *",
      "timezone": "UTC"
    },
    "conflict_resolution": "timestamp",
    "priority": "local",
    "filters": {
      "domains": ["example.com"],
      "status": ["active"]
    }
  }'
```

## Testing

### Send Test Webhook

```bash
curl -X POST https://api.example.com/webhooks/incoming/test-partner \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=test" \
  -H "X-Webhook-Timestamp: $(date +%s)" \
  -H "X-Webhook-Id: test-$(date +%s)" \
  -d '{
    "event": "ping",
    "data": {
      "code": "test",
      "url": "https://example.com/test",
      "domain": "example.com"
    }
  }'
```

### Check Dead Letter Queue

```bash
curl https://api.example.com/webhooks/dlq \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Retry Failed Event

```bash
curl -X POST https://api.example.com/webhooks/dlq/evt_abc123/sub_def456 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## File Structure

```
worker/
├── lib/
│   ├── webhook-handler.ts    # Core webhook logic
│   ├── hmac.ts               # HMAC utilities
│   └── webhook-sdk.ts        # Partner SDK
├── routes/
│   └── webhooks.ts           # API endpoints
└── types.ts                  # TypeScript types
```

## Configuration

Add to your `wrangler.jsonc`:

```jsonc
[env.production]
kv_namespaces = [
  { binding = "DEALS_PROD", id = "..." },
  { binding = "DEALS_STAGING", id = "..." },
  { binding = "DEALS_WEBHOOKS", id = "..." }  # Optional: dedicated webhook KV
]
```

## Error Handling

The SDK provides detailed error messages:

```typescript
try {
  await client.sendReferralCreated(data);
} catch (error) {
  if (error.message.includes("URL")) {
    // URL format error - must use complete URL
  } else if (error.message.includes("signature")) {
    // Signature verification failed
  } else if (error.message.includes("timestamp")) {
    // Request too old - check system clock
  }
}
```

## Best Practices

1. **Always verify signatures** on incoming webhooks
2. **Use idempotency keys** for at-least-once delivery
3. **Store secrets securely** (environment variables, not code)
4. **Handle retries properly** - webhooks may be delivered multiple times
5. **Use HTTPS endpoints** only
6. **Respond quickly** (< 5s) to webhook requests
7. **Process asynchronously** if webhook handling is slow
8. **Log webhook events** for debugging and audit trails

## Support

For issues or questions:

- Check the [API documentation](../docs/API.md)
- Review [handoff notes](../temp/handoff-webhook.md)
- See [system architecture](../agents-docs/SYSTEM_REFERENCE.md)
