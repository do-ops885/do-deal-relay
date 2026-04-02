# Webhook/API Integration Design Document

**Version: 0.1.1  
**Status**: Draft  
**Last Updated**: 2026-04-01  
**Target**: Enterprise-ready referral code management system

---

## 1. Executive Summary

This document defines a comprehensive webhook and API integration architecture for managing referral codes/links in a distributed, event-driven system. The design prioritizes security, reliability, and developer experience while supporting enterprise-scale workloads.

### Key Capabilities

| Capability | Description | Priority |
|------------|-------------|----------|
| Webhook Ingestion | Secure push endpoints for external services | P0 |
| REST API | Full CRUD operations for partners | P0 |
| Event Streaming | Real-time event distribution | P1 |
| Bidirectional Sync | Two-way synchronization with partner systems | P1 |
| Batch Operations | Efficient bulk import/export | P1 |
| SDK Support | Auto-generated client libraries | P2 |

---

## 2. Architecture Overview

### 2.1 System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Ecosystem                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Partner A          Partner B          Web Dashboard      Mobile App       │
│       │                  │                   │                 │           │
│       └──────────────────┴───────────────────┴─────────────────┘           │
│                              │                                              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   API Gateway       │
                    │  (Cloudflare)       │
                    │  • Rate Limiting    │
                    │  • Auth Validation  │
                    │  • Request Routing  │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────▼─────────┐ ┌────────▼────────┐ ┌───────▼───────┐
│  Webhook Router   │ │   REST API      │ │  Event Bus    │
│  /v1/webhooks/*   │ │   /v1/*         │ │  /v1/events   │
├───────────────────┤ ├─────────────────┤ ├───────────────┤
│ • Signature Verif │ │ • CRUD Ops      │ │ • SSE Stream  │
│ • Event Transform │ │ • Batch Ops     │ │ • Webhook Out │
│ • Idempotency     │ │ • Search/Filter │ │ • Queue Mgmt  │
└─────────┬─────────┘ └────────┬────────┘ └───────┬───────┘
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Core Services     │
                    │  • Validation       │
                    │  • Storage (KV/D1)  │
                    │  • Pipeline         │
                    └─────────────────────┘
```

### 2.2 API Versioning Strategy

**URL Path Versioning** (Primary)
```
https://api.deals.example.com/v1/referrals
https://api.deals.example.com/v2/referrals
```

**Header Versioning** (Alternative)
```
Accept: application/vnd.deals+json; version=1.0
X-API-Version: 2024-04-01
```

**Deprecation Policy**
- New versions: 6 months notice before GA
- Deprecated versions: 12 month sunset period
- Legacy versions: Read-only for 6 additional months

---

## 3. Authentication & Security

### 3.1 Authentication Methods

#### 3.1.1 API Key Authentication (Public APIs)

```http
GET /v1/referrals HTTP/1.1
Host: api.deals.example.com
Authorization: Bearer dk_live_xxxxxxxxxxxxxxxx
X-Client-ID: partner_abc123
```

**API Key Format**:
- Prefix indicates environment: `dk_live_`, `dk_test_`, `dk_sandbox_`
- 32-byte base64-encoded secret
- Keys stored in `DEALS_API_KEYS` KV namespace

**Key Scopes**:
```typescript
type ApiScope = 
  | "referrals:read"      // List and get referral codes
  | "referrals:write"     // Create/update codes
  | "referrals:delete"    // Deactivate/remove codes
  | "webhooks:read"       // View webhook configurations
  | "webhooks:write"      // Configure webhooks
  | "batch:execute"       // Run batch operations
  | "analytics:read";     // Access metrics and reports
```

#### 3.1.2 Webhook Signature Verification (HMAC-SHA256)

**Incoming Webhooks** (Partners → Our System):
```http
POST /v1/webhooks/incoming/{partner_id} HTTP/1.1
Host: api.deals.example.com
Content-Type: application/json
X-Webhook-Signature: sha256=a1b2c3d4e5f6...
X-Webhook-Timestamp: 1711972800
X-Webhook-Id: wh_abc123def456

{"event": "referral.created", ...}
```

**Signature Verification Process**:
```typescript
// HMAC-SHA256 Implementation
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number
): Promise<boolean> {
  // 1. Check timestamp (prevent replay attacks, ±5 min tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    throw new Error("Webhook timestamp too old");
  }

  // 2. Build signed payload
  const signedPayload = `${timestamp}.${payload}`;
  
  // 3. Compute HMAC
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );
  
  const computedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  // 4. Constant-time comparison
  return timingSafeEqual(computedSignature, signature.toLowerCase());
}
```

**Outgoing Webhooks** (Our System → Partners):
```http
POST https://partner.com/webhooks/deals HTTP/1.1
Content-Type: application/json
X-Deals-Signature: sha256=x1y2z3...
X-Deals-Timestamp: 1711972800
X-Deals-Event-Id: evt_abc123
X-Deals-Event-Type: referral.validated

{"data": {...}, "event": "referral.validated"}
```

### 3.2 Security Headers

All API responses include:
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'none'
```

---

## 4. Webhook Endpoint Specifications

### 4.1 Incoming Webhooks (Ingestion)

#### Endpoint: `POST /v1/webhooks/incoming/{partner_id}`

**Purpose**: Receive referral code updates from partner systems

**Request Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `X-Webhook-Signature` | Yes | HMAC-SHA256 signature |
| `X-Webhook-Timestamp` | Yes | Unix timestamp (seconds) |
| `X-Webhook-Id` | Yes | Unique event identifier |
| `User-Agent` | Yes | Identifies sending service |

**Event Types**:

```typescript
type IncomingWebhookEvent =
  | { type: "referral.created"; data: ReferralCreatedPayload }
  | { type: "referral.updated"; data: ReferralUpdatedPayload }
  | { type: "referral.deactivated"; data: ReferralDeactivatedPayload }
  | { type: "referral.expired"; data: ReferralExpiredPayload }
  | { type: "batch.completed"; data: BatchCompletedPayload }
  | { type: "ping"; data: PingPayload };
```

**Payload Schemas**:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "referral.created": {
      "type": "object",
      "required": ["code", "url", "domain"],
      "properties": {
        "code": { "type": "string", "minLength": 1, "maxLength": 100 },
        "url": { "type": "string", "format": "uri" },
        "domain": { "type": "string", "format": "hostname" },
        "title": { "type": "string", "maxLength": 200 },
        "description": { "type": "string", "maxLength": 1000 },
        "reward": {
          "type": "object",
          "required": ["type"],
          "properties": {
            "type": { "enum": ["cash", "credit", "percent", "item"] },
            "value": {},
            "currency": { "type": "string", "minLength": 3, "maxLength": 3 }
          }
        },
        "expires_at": { "type": "string", "format": "date-time" },
        "metadata": { "type": "object" },
        "external_id": { "type": "string" }
      }
    }
  }
}
```

**Response Codes**:
| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Event processed, no retry |
| 201 | Created | Resource created successfully |
| 202 | Accepted | Queued for async processing |
| 400 | Bad Request | Invalid payload, no retry |
| 401 | Unauthorized | Invalid signature, no retry |
| 409 | Conflict | Duplicate event (idempotent), no retry |
| 429 | Rate Limited | Retry with exponential backoff |
| 500 | Server Error | Retry with exponential backoff |

### 4.2 Outgoing Webhooks (Subscriptions)

#### Endpoint Configuration

Partners register webhook endpoints via API:

```http
POST /v1/webhooks/subscriptions HTTP/1.1
Authorization: Bearer dk_live_xxxxx
Content-Type: application/json

{
  "url": "https://partner.com/webhooks/deals",
  "events": ["referral.created", "referral.validated", "referral.deactivated"],
  "secret": "whsec_xxxxxxxx",
  "metadata": {
    "environment": "production",
    "team": "engineering"
  },
  "retry_policy": {
    "max_attempts": 5,
    "backoff_multiplier": 2,
    "initial_delay_ms": 1000
  }
}
```

**Outgoing Event Types**:

| Event | Description | Payload Size |
|-------|-------------|--------------|
| `referral.created` | New referral code added | ~2KB |
| `referral.validated` | Code passed validation | ~1KB |
| `referral.quarantined` | Code failed validation | ~1KB |
| `referral.deactivated` | Code manually disabled | ~500B |
| `referral.expired` | Code reached expiration | ~500B |
| `batch.completed` | Bulk operation finished | ~5KB |
| `ping` | Health check | ~200B |

---

## 5. REST API Specification

### 5.1 Endpoints Overview

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| GET | `/v1/referrals` | List referral codes | 100/min |
| GET | `/v1/referrals/:id` | Get specific code | 100/min |
| POST | `/v1/referrals` | Create new code | 20/min |
| PUT | `/v1/referrals/:id` | Update code | 20/min |
| DELETE | `/v1/referrals/:id` | Deactivate code | 20/min |
| POST | `/v1/referrals/batch` | Bulk operations | 5/min |
| GET | `/v1/referrals/search` | Advanced search | 50/min |
| GET | `/v1/validate/:code` | Validate code | 200/min |
| POST | `/v1/import` | Import from URL | 10/min |
| GET | `/v1/analytics` | Usage metrics | 30/min |

### 5.2 Detailed Endpoint Specifications

#### 5.2.1 List Referrals

```http
GET /v1/referrals?status=active&domain=trading212.com&limit=50&offset=0 HTTP/1.1
Authorization: Bearer dk_live_xxxxx
```

**Query Parameters**:
```typescript
interface ListReferralsQuery {
  status?: "active" | "inactive" | "expired" | "quarantined" | "all";
  domain?: string;
  category?: string;
  source?: "manual" | "web_research" | "api" | "discovered";
  created_after?: string; // ISO 8601
  created_before?: string;
  reward_type?: "cash" | "credit" | "percent" | "item";
  min_confidence?: number; // 0-1
  sort_by?: "created" | "updated" | "confidence" | "reward";
  sort_order?: "asc" | "desc";
  limit?: number; // 1-1000, default 100
  offset?: number; // default 0
}
```

**Response**:
```json
{
  "data": [
    {
      "id": "ref_abc123",
      "code": "GcCOCxbo",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "domain": "trading212.com",
      "title": "Get a Free Share",
      "description": "Sign up and receive a free share worth up to £100",
      "status": "active",
      "reward": {
        "type": "item",
        "value": "Free share worth up to £100",
        "currency": "GBP"
      },
      "confidence_score": 0.92,
      "created_at": "2024-03-15T10:30:00Z",
      "updated_at": "2024-03-15T10:30:00Z",
      "expires_at": null,
      "metadata": {
        "category": ["finance", "trading"],
        "tags": ["stocks", "investing"],
        "source": "api",
        "external_id": "partner_ref_123"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "has_more": true,
    "next_offset": 50
  },
  "meta": {
    "request_id": "req_xyz789",
    "timestamp": "2024-04-01T12:00:00Z"
  }
}
```

#### 5.2.2 Create Referral

```http
POST /v1/referrals HTTP/1.1
Authorization: Bearer dk_live_xxxxx
Content-Type: application/json
Idempotency-Key: idem-abc-123

{
  "code": "INVITE2024",
  "url": "https://example.com/invite/INVITE2024",
  "domain": "example.com",
  "title": "20% Off First Purchase",
  "description": "New customers get 20% off their first order",
  "reward": {
    "type": "percent",
    "value": 20,
    "currency": "USD"
  },
  "expires_at": "2024-12-31T23:59:59Z",
  "metadata": {
    "category": ["shopping"],
    "tags": ["discount", "new-customer"],
    "external_id": "campaign_001"
  }
}
```

**Idempotency**:
- `Idempotency-Key` header ensures duplicate requests don't create duplicates
- Keys stored for 24 hours
- Same key + same payload = same response
- Same key + different payload = 409 Conflict

#### 5.2.3 Batch Operations

```http
POST /v1/referrals/batch HTTP/1.1
Authorization: Bearer dk_live_xxxxx
Content-Type: application/json

{
  "operations": [
    {
      "method": "POST",
      "path": "/v1/referrals",
      "body": { /* referral data */ },
      "idempotency_key": "batch-1"
    },
    {
      "method": "PUT", 
      "path": "/v1/referrals/ref_abc123",
      "body": { /* update data */ },
      "idempotency_key": "batch-2"
    },
    {
      "method": "DELETE",
      "path": "/v1/referrals/ref_def456",
      "idempotency_key": "batch-3"
    }
  ],
  "continue_on_error": true
}
```

**Response**:
```json
{
  "batch_id": "batch_xyz789",
  "status": "completed",
  "processed_at": "2024-04-01T12:00:00Z",
  "results": [
    {
      "index": 0,
      "status": 201,
      "success": true,
      "data": { "id": "ref_new123" }
    },
    {
      "index": 1,
      "status": 200,
      "success": true,
      "data": { /* updated referral */ }
    },
    {
      "index": 2,
      "status": 404,
      "success": false,
      "error": {
        "code": "not_found",
        "message": "Referral ref_def456 not found"
      }
    }
  ],
  "summary": {
    "total": 3,
    "succeeded": 2,
    "failed": 1
  }
}
```

#### 5.2.4 Import from External Source

```http
POST /v1/import HTTP/1.1
Authorization: Bearer dk_live_xxxxx
Content-Type: application/json

{
  "source": {
    "type": "url",
    "url": "https://partner.com/api/codes",
    "headers": {
      "Authorization": "Bearer partner_token"
    }
  },
  "mapping": {
    "code": "referral_code",
    "url": "landing_url",
    "domain": "brand_domain",
    "reward.type": "incentive_type",
    "reward.value": "incentive_amount"
  },
  "options": {
    "skip_invalid": true,
    "confidence_threshold": 0.7,
    "notify_on_complete": true
  }
}
```

---

## 6. Event-Driven Architecture

### 6.1 Event Bus Design

```
┌─────────────────────────────────────────────────────────┐
│                    Event Producers                       │
│  (API Calls / Webhooks / Pipeline / Scheduled Tasks)     │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │     Event Router       │
         │  (Cloudflare Workers)  │
         │  • Event Validation    │
         │  • Routing Logic       │
         │  • Fan-out             │
         └───────────┬────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
┌───────▼───┐ ┌──────▼────┐ ┌─────▼─────┐
│ Webhook   │ │  SSE      │ │  Queue    │
│ Delivery  │ │  Stream   │ │  (R2/KV)  │
└───────────┘ └───────────┘ └───────────┘
```

### 6.2 Event Schema

```typescript
interface DomainEvent {
  // Event Identity
  id: string;              // Unique event ID (evt_xxx)
  type: string;            // Event type (referral.created)
  version: string;         // Event schema version
  
  // Timing
  timestamp: string;       // ISO 8601 UTC
  received_at: string;     // When system received it
  processed_at?: string;   // When processing completed
  
  // Source
  source: {
    type: "api" | "webhook" | "pipeline" | "system";
    id?: string;          // Client/partner ID
    ip?: string;          // Source IP (if applicable)
    user_agent?: string;
  };
  
  // Data
  data: unknown;           // Event-specific payload
  
  // Metadata
  metadata: {
    request_id: string;
    trace_id: string;
    correlation_id?: string;
    environment: "production" | "staging" | "development";
  };
  
  // Idempotency
  idempotency_key?: string;
}
```

### 6.3 Server-Sent Events (SSE) Stream

```http
GET /v1/events/stream HTTP/1.1
Authorization: Bearer dk_live_xxxxx
Accept: text/event-stream
Last-Event-ID: evt_last_seen_123
```

**Event Stream Format**:
```
event: referral.created
data: {"id": "evt_001", "type": "referral.created", "data": {...}}
id: evt_001
retry: 3000

event: referral.validated
data: {"id": "evt_002", "type": "referral.validated", "data": {...}}
id: evt_002
```

---

## 7. Retry Logic & Idempotency

### 7.1 Retry Configuration

```typescript
interface RetryPolicy {
  max_attempts: number;        // 3-10 (default: 3)
  initial_delay_ms: number;    // 1000-10000 (default: 1000)
  max_delay_ms: number;        // 60000-300000 (default: 60000)
  backoff_multiplier: number;  // 1.5-4.0 (default: 2.0)
  backoff_strategy: "exponential" | "linear" | "fixed";
  retryable_statuses: number[]; // [408, 429, 500, 502, 503, 504]
  timeout_ms: number;          // 30000-120000
}
```

### 7.2 Exponential Backoff Formula

```typescript
function calculateDelay(
  attempt: number,
  config: RetryPolicy
): number {
  const base = config.initial_delay_ms;
  const multiplier = Math.pow(config.backoff_multiplier, attempt - 1);
  const jitter = Math.random() * 1000; // Add randomness to prevent thundering herd
  
  return Math.min(
    base * multiplier + jitter,
    config.max_delay_ms
  );
}

// Example delays with default config (attempt 1-5):
// Attempt 1: ~1000ms + jitter
// Attempt 2: ~2000ms + jitter
// Attempt 3: ~4000ms + jitter
// Attempt 4: ~8000ms + jitter
// Attempt 5: ~16000ms + jitter (capped at max_delay_ms)
```

### 7.3 Idempotency Implementation

```typescript
// Idempotency key storage in KV
interface IdempotencyRecord {
  key: string;
  request_hash: string;      // Hash of request body + path + method
  response_body: string;     // Cached response
  response_status: number;
  created_at: string;
  expires_at: string;        // TTL: 24 hours
}

// Check idempotency
async function checkIdempotency(
  key: string,
  request: Request
): Promise<Response | null> {
  const stored = await IDEMPOTENCY_KV.get(key);
  
  if (!stored) return null;
  
  const record: IdempotencyRecord = JSON.parse(stored);
  const currentHash = hashRequest(request);
  
  if (record.request_hash !== currentHash) {
    throw new Error("Idempotency-Key conflict: different payload");
  }
  
  // Return cached response
  return new Response(record.response_body, {
    status: record.response_status,
    headers: {
      "X-Idempotency-Key": key,
      "X-Cache": "HIT"
    }
  });
}
```

### 7.4 Dead Letter Queue (DLQ)

Failed webhooks after all retries go to DLQ:

```typescript
interface DeadLetterEvent {
  original_event: DomainEvent;
  failed_attempts: Array<{
    timestamp: string;
    status_code?: number;
    error_message: string;
    response_body?: string;
  }>;
  enqueued_at: string;
  retry_count: number;
  dlq_reason: "max_retries" | "timeout" | "parsing_error";
}

// DLQ processing options:
// 1. Manual replay via API
// 2. Automatic replay after 1 hour (if configured)
// 3. Alert + human intervention
```

---

## 8. Rate Limiting

### 8.1 Rate Limiting Strategy

```
┌──────────────────────────────────────────────────────────┐
│                    Rate Limit Tiers                      │
├──────────────┬───────────────┬─────────────┬─────────────┤
│ Tier         │ Requests/Min  │ Burst       │ Webhooks   │
├──────────────┼───────────────┼─────────────┼─────────────┤
│ Free         │ 60            │ 10          │ 1/min      │
│ Basic        │ 300           │ 50          │ 10/min     │
│ Pro          │ 1,000         │ 200         │ 60/min     │
│ Enterprise   │ 5,000         │ 500         │ 300/min    │
│ Internal     │ 10,000        │ 1,000       │ 1,000/min  │
└──────────────┴───────────────┴─────────────┴─────────────┘
```

### 8.2 Rate Limit Headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1711976400
X-RateLimit-Policy: 1000;w=60;burst=200

HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711976400
```

### 8.3 Token Bucket Implementation

```typescript
interface TokenBucket {
  tokens: number;
  last_refill: number;
  capacity: number;
  refill_rate: number; // tokens per second
}

async function checkRateLimit(
  clientId: string,
  tier: RateLimitTier
): Promise<RateLimitResult> {
  const key = `ratelimit:${clientId}`;
  const now = Date.now();
  
  // Get or create bucket
  const bucket = await RATE_LIMIT_KV.get(key);
  const state: TokenBucket = bucket ? JSON.parse(bucket) : {
    tokens: tier.capacity,
    last_refill: now,
    capacity: tier.capacity,
    refill_rate: tier.limit / 60 // per minute to per second
  };
  
  // Refill tokens
  const elapsed = (now - state.last_refill) / 1000;
  state.tokens = Math.min(
    state.capacity,
    state.tokens + elapsed * state.refill_rate
  );
  state.last_refill = now;
  
  // Check and consume
  if (state.tokens >= 1) {
    state.tokens -= 1;
    await RATE_LIMIT_KV.put(key, JSON.stringify(state), { expirationTtl: 3600 });
    return { allowed: true, remaining: Math.floor(state.tokens) };
  }
  
  // Rate limited
  const retryAfter = Math.ceil((1 - state.tokens) / state.refill_rate);
  return { allowed: false, retryAfter };
}
```

---

## 9. OpenAPI 3.1 Specification

### 9.1 Spec Structure

```yaml
openapi: 3.1.0
info:
  title: Deal Discovery API
  version: 1.0.0
  description: |
    Enterprise-grade API for managing referral codes and deals.
    Features webhook ingestion, batch operations, and event streaming.
  contact:
    name: API Support
    email: api@deals.example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: https://api.deals.example.com/v1
    description: Production
  - url: https://api-staging.deals.example.com/v1
    description: Staging

security:
  - BearerAuth: []
  - ApiKeyAuth: []

tags:
  - name: Referrals
    description: Referral code management
  - name: Webhooks
    description: Webhook configuration and ingestion
  - name: Batch
    description: Bulk operations
  - name: Analytics
    description: Metrics and reporting
  - name: Events
    description: Event streaming

paths:
  /referrals:
    get:
      operationId: listReferrals
      summary: List referral codes
      tags: [Referrals]
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, inactive, expired, quarantined, all]
        - name: domain
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 1000
            default: 100
        - $ref: '#/components/parameters/IdempotencyKey'
      responses:
        '200':
          description: List of referrals
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ReferralList'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimited'
    
    post:
      operationId: createReferral
      summary: Create a new referral code
      tags: [Referrals]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ReferralCreate'
      responses:
        '201':
          description: Referral created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Referral'
        '409':
          description: Conflict - duplicate idempotency key

  /webhooks/incoming/{partner_id}:
    post:
      operationId: incomingWebhook
      summary: Receive webhook from partner
      tags: [Webhooks]
      parameters:
        - name: partner_id
          in: path
          required: true
          schema:
            type: string
        - name: X-Webhook-Signature
          in: header
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/WebhookEvent'
      responses:
        '202':
          description: Event accepted
        '401':
          description: Invalid signature

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: API key
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key

  parameters:
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: false
      schema:
        type: string
      description: Unique key for idempotent requests

  schemas:
    Referral:
      type: object
      required: [id, code, url, domain, status, created_at]
      properties:
        id:
          type: string
          pattern: '^ref_[a-zA-Z0-9]+$'
        code:
          type: string
          minLength: 1
          maxLength: 100
        url:
          type: string
          format: uri
        domain:
          type: string
          format: hostname
        title:
          type: string
          maxLength: 200
        description:
          type: string
          maxLength: 1000
        status:
          type: string
          enum: [active, inactive, expired, quarantined]
        reward:
          $ref: '#/components/schemas/Reward'
        confidence_score:
          type: number
          minimum: 0
          maximum: 1
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
        expires_at:
          type: string
          format: date-time
          nullable: true
        metadata:
          type: object
          additionalProperties: true

    Reward:
      type: object
      required: [type]
      properties:
        type:
          type: string
          enum: [cash, credit, percent, item]
        value:
          oneOf:
            - type: number
            - type: string
        currency:
          type: string
          pattern: '^[A-Z]{3}$'
        description:
          type: string

    ReferralList:
      type: object
      required: [data, pagination]
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/Referral'
        pagination:
          $ref: '#/components/schemas/Pagination'
        meta:
          $ref: '#/components/schemas/Meta'

    Pagination:
      type: object
      properties:
        total:
          type: integer
        limit:
          type: integer
        offset:
          type: integer
        has_more:
          type: boolean
        next_offset:
          type: integer
          nullable: true

    Meta:
      type: object
      properties:
        request_id:
          type: string
        timestamp:
          type: string
          format: date-time

    WebhookEvent:
      type: object
      required: [event, data]
      properties:
        event:
          type: string
          enum:
            - referral.created
            - referral.updated
            - referral.deactivated
            - referral.expired
            - ping
        data:
          type: object
        external_id:
          type: string

  responses:
    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
              message:
                type: string

    RateLimited:
      description: Rate limit exceeded
      headers:
        Retry-After:
          schema:
            type: integer
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
              retry_after:
                type: integer
```

---

## 10. SDK Generation

### 10.1 Supported Languages

| Language | Priority | Generator | Package Manager |
|----------|----------|-----------|-----------------|
| TypeScript | P0 | openapi-generator | npm |
| Python | P0 | openapi-generator | PyPI |
| Go | P1 | openapi-generator | Go modules |
| Java | P1 | openapi-generator | Maven/Gradle |
| Ruby | P2 | openapi-generator | RubyGems |
| PHP | P2 | openapi-generator | Composer |

### 10.2 TypeScript SDK Example

```typescript
import { DealsApi, Configuration } from '@deals/sdk';

const config = new Configuration({
  apiKey: 'dk_live_xxxxx',
  basePath: 'https://api.deals.example.com/v1'
});

const api = new DealsApi(config);

// List referrals
const referrals = await api.listReferrals({
  status: 'active',
  limit: 50
});

// Create with idempotency
const newReferral = await api.createReferral({
  code: 'WELCOME2024',
  url: 'https://example.com/ref/WELCOME2024',
  domain: 'example.com',
  reward: { type: 'percent', value: 20 }
}, {
  idempotencyKey: 'unique-key-123'
});

// Batch operations
const batch = await api.batchOperations({
  operations: [
    { method: 'POST', path: '/v1/referrals', body: {...} },
    { method: 'PUT', path: '/v1/referrals/ref_123', body: {...} }
  ]
});
```

### 10.3 Python SDK Example

```python
from deals_sdk import DealsApi, Configuration

config = Configuration(
    api_key="dk_live_xxxxx",
    base_path="https://api.deals.example.com/v1"
)

api = DealsApi(config)

# List with pagination
referrals = api.list_referrals(status="active", limit=50)
for referral in referrals.data:
    print(f"{referral.code}: {referral.reward.value}")

# Create referral
new_ref = api.create_referral(
    code="WELCOME2024",
    url="https://example.com/ref/WELCOME2024",
    domain="example.com",
    reward={"type": "percent", "value": 20},
    idempotency_key="unique-key-123"
)

# Handle webhooks
from deals_sdk.webhooks import WebhookVerifier

verifier = WebhookVerifier(secret="whsec_xxxxx")

@app.route("/webhooks", methods=["POST"])
def handle_webhook():
    signature = request.headers["X-Deals-Signature"]
    payload = request.get_data()
    
    if verifier.verify(payload, signature):
        event = request.json
        process_event(event)
        return "", 200
    return "Invalid signature", 401
```

### 10.4 SDK Generation Configuration

```json
{
  "$schema": "https://openapi-generator.tech/schemas/config.json",
  "generatorName": "typescript-fetch",
  "outputDir": "./sdk/typescript",
  "inputSpec": "./openapi.yaml",
  "additionalProperties": {
    "npmName": "@deals/sdk",
    "npmVersion: 0.1.1",
    "supportsES6": true,
    "typescriptThreePlus": true,
    "modelPropertyNaming": "camelCase",
    "paramNaming": "camelCase",
    "enumPropertyNaming": "UPPERCASE",
    "generateAliasAsModel": true,
    "disallowAdditionalPropertiesIfNotPresent": true
  }
}
```

---

## 11. Bidirectional Sync

### 11.1 Sync Architecture

```
┌─────────────────┐                    ┌─────────────────┐
│   Our System    │ ◄─────────────────► │  Partner System │
│                 │     Sync Bridge    │                 │
├─────────────────┤                    ├─────────────────┤
│ • Referral DB   │                    │ • Partner DB    │
│ • Event Bus     │                    │ • Webhook API   │
│ • Webhook Out   │                    │ • Change Stream │
│ • Sync State    │                    │                 │
└─────────────────┘                    └─────────────────┘
         │                                      │
         └──────────┬───────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │   Sync State Store  │
         │   (KV/D1)           │
         │                     │
         │ • last_sync_at      │
         │ • sync_cursor       │
         │ • conflict_log      │
         │ • pending_changes   │
         └─────────────────────┘
```

### 11.2 Sync Protocol

```typescript
interface SyncConfig {
  partner_id: string;
  direction: "push" | "pull" | "bidirectional";
  mode: "realtime" | "scheduled" | "manual";
  
  // Schedule (if mode=scheduled)
  schedule?: {
    cron: string;           // "0 */6 * * *" (every 6 hours)
    timezone: string;       // "UTC"
  };
  
  // Conflict resolution
  conflict_resolution: "timestamp" | "priority" | "manual";
  priority: "local" | "remote"; // Which wins in conflict
  
  // Filters
  filters?: {
    domains?: string[];
    status?: string[];
    created_after?: string;
  };
  
  // Mappings
  field_mapping?: Record<string, string>;
}

interface SyncState {
  partner_id: string;
  last_sync_at: string;
  cursor?: string;          // Pagination cursor for resumable sync
  sync_version: number;     // Incremented each sync
  pending_changes: number;
  last_error?: string;
  status: "idle" | "syncing" | "error";
}
```

### 11.3 Conflict Resolution Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `timestamp` | Latest update wins | General purpose |
| `priority` | Predefined system wins | Master/slave setup |
| `merge` | Combine non-conflicting fields | Rich data objects |
| `manual` | Queue for review | High-value codes |

```typescript
async function resolveConflict(
  local: Referral,
  remote: Referral,
  strategy: ConflictStrategy
): Promise<Referral> {
  switch (strategy) {
    case "timestamp":
      return new Date(local.updated_at) > new Date(remote.updated_at) 
        ? local : remote;
    
    case "priority":
      return config.priority === "local" ? local : remote;
    
    case "merge":
      return {
        ...local,
        ...remote,
        metadata: { ...local.metadata, ...remote.metadata },
        updated_at: new Date().toISOString()
      };
    
    case "manual":
      await queueForReview(local, remote);
      return null; // No auto-resolution
  }
}
```

---

## 12. Sample Integrations

### 12.1 Partner Webhook Integration

**Scenario**: Trading platform pushes new referral codes

```javascript
// Partner's webhook sender (Node.js)
const crypto = require('crypto');

async function sendReferralWebhook(referral) {
  const payload = JSON.stringify({
    event: 'referral.created',
    data: {
      code: referral.code,
      url: referral.url,
      domain: 'trading212.com',
      reward: referral.reward
    },
    external_id: referral.id
  });
  
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');
  
  const response = await fetch('https://api.deals.example.com/v1/webhooks/incoming/trading212', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Timestamp': timestamp.toString(),
      'X-Webhook-Id': `wh_${referral.id}`
    },
    body: payload
  });
  
  if (response.status === 202) {
    console.log('Webhook accepted');
  } else {
    console.error('Webhook failed:', await response.text());
  }
}
```

### 12.2 E-commerce Platform Integration

**Scenario**: Shop imports codes and syncs inventory

```python
# E-commerce integration (Python)
from deals_sdk import DealsApi, SyncManager

class EcommerceSync:
    def __init__(self, api_key, shop_domain):
        self.api = DealsApi(api_key=api_key)
        self.shop = shop_domain
        self.sync = SyncManager(self.api)
    
    def import_promo_codes(self, codes):
        """Bulk import promo codes from shop"""
        operations = []
        
        for code in codes:
            operations.append({
                'method': 'POST',
                'path': '/v1/referrals',
                'body': {
                    'code': code['promo_code'],
                    'url': f'https://{self.shop}/promo/{code["promo_code"]}',
                    'domain': self.shop,
                    'reward': {
                        'type': 'percent' if code['type'] == 'percentage' else 'cash',
                        'value': code['discount_amount'],
                        'currency': code.get('currency', 'USD')
                    },
                    'expires_at': code.get('expires_at'),
                    'metadata': {
                        'external_id': code['id'],
                        'source': 'shopify_import'
                    }
                },
                'idempotency_key': f'shopify-{code["id"]}'
            })
        
        # Submit batch
        result = self.api.batch_operations({
            'operations': operations,
            'continue_on_error': True
        })
        
        return self._report_results(result)
    
    def setup_webhook_subscription(self, callback_url):
        """Subscribe to deal changes"""
        return self.api.create_webhook_subscription({
            'url': callback_url,
            'events': [
                'referral.validated',
                'referral.quarantined',
                'referral.expired'
            ],
            'filter': {
                'domain': self.shop
            }
        })
```

### 12.3 Mobile App SDK Integration

**Scenario**: Mobile app displays available deals

```swift
// iOS SDK integration (Swift)
import DealsSDK

class DealService {
    private let client: DealsClient
    
    init(apiKey: String) {
        self.client = DealsClient(apiKey: apiKey)
    }
    
    func fetchActiveDeals(category: String? = nil) async throws -> [Deal] {
        let response = try await client.referrals.list(
            status: .active,
            category: category,
            limit: 50
        )
        return response.data
    }
    
    func validateCode(_ code: String) async throws -> ValidationResult {
        return try await client.referrals.validate(code: code)
    }
    
    func submitDeal(_ deal: DealSubmission) async throws -> Deal {
        return try await client.referrals.create(
            code: deal.code,
            url: deal.url,
            domain: deal.domain,
            reward: deal.reward,
            idempotencyKey: UUID().uuidString
        )
    }
}

// Usage in ViewModel
@MainActor
class DealsViewModel: ObservableObject {
    @Published var deals: [Deal] = []
    @Published var isLoading = false
    
    private let service = DealService(apiKey: "dk_live_xxxxx")
    
    func loadDeals() async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            deals = try await service.fetchActiveDeals(category: "trading")
        } catch {
            // Handle error
        }
    }
}
```

---

## 13. Pros and Cons Analysis

### 13.1 Architecture Decisions

| Decision | Pros | Cons |
|----------|------|------|
| **Webhook-first ingestion** | Real-time updates; Decoupled systems; Partner-friendly | Delivery uncertainty; Retry complexity; Endpoint maintenance |
| **REST API + Event streaming** | Familiar patterns; Flexible queries; Real-time options | Higher latency than pure streaming; Connection overhead |
| **HMAC signature verification** | Cryptographically secure; No token expiration; Simple | Shared secret management; No fine-grained revocation |
| **API Key authentication** | Easy implementation; Clear audit trail | Key rotation challenges; No SSO/OAuth flows |
| **URL path versioning** | Clear and explicit; Cache-friendly | URL proliferation; Bookmark issues |
| **Token bucket rate limiting** | Burst handling; Fair distribution | Complex implementation; State management |
| **KV-based idempotency** | Fast lookups; Edge-distributed | 24h TTL limitation; No complex queries |

### 13.2 Trade-offs Summary

**Security vs. Convenience**
- Chosen: Strict HMAC + API keys with clear documentation
- Alternative: OAuth 2.0 (more complex, but better for user delegation)

**Consistency vs. Availability**
- Chosen: Eventual consistency with idempotency
- Alternative: Strong consistency (higher latency, lower throughput)

**Flexibility vs. Simplicity**
- Chosen: Rich batch operations + field mapping
- Alternative: Simple CRUD (easier to learn, less powerful)

**Real-time vs. Reliability**
- Chosen: Webhooks with DLQ + SSE for streaming
- Alternative: Pure polling (simpler, but wasteful)

### 13.3 Recommendations

| Scenario | Recommended Approach |
|----------|---------------------|
| High-volume partner (>1000 events/min) | Dedicated queue + batching |
| Security-critical (financial data) | OAuth 2.0 + mTLS |
| Mobile app integration | REST API + SSE for updates |
| E-commerce platform | Bidirectional sync + webhooks |
| One-time import | Batch API with field mapping |
| Real-time dashboards | SSE stream + caching |

---

## 14. Implementation Roadmap

### Phase 1: Core API (Weeks 1-2)
- [ ] Authentication middleware (API keys)
- [ ] Basic CRUD endpoints
- [ ] Rate limiting (token bucket)
- [ ] Idempotency layer

### Phase 2: Webhooks (Weeks 3-4)
- [ ] Incoming webhook endpoint
- [ ] HMAC signature verification
- [ ] Outgoing webhook subscriptions
- [ ] Retry mechanism with DLQ

### Phase 3: Advanced Features (Weeks 5-6)
- [ ] Batch operations endpoint
- [ ] Import/mapping system
- [ ] SSE event streaming
- [ ] Bidirectional sync engine

### Phase 4: Developer Experience (Weeks 7-8)
- [ ] OpenAPI specification
- [ ] SDK generation (TypeScript, Python)
- [ ] Webhook testing tools
- [ ] API documentation portal

---

## 15. Appendix

### A. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `invalid_request` | 400 | Malformed request |
| `invalid_signature` | 401 | HMAC verification failed |
| `unauthorized` | 401 | Invalid API key |
| `forbidden` | 403 | Insufficient permissions |
| `not_found` | 404 | Resource doesn't exist |
| `conflict` | 409 | Resource already exists |
| `idempotency_conflict` | 409 | Key reuse with different payload |
| `rate_limited` | 429 | Too many requests |
| `internal_error` | 500 | Server error |
| `service_unavailable` | 503 | Temporary outage |

### B. Webhook Signature Examples

```python
# Python signature generation
import hmac
import hashlib
import time

def generate_signature(secret: str, payload: str) -> str:
    timestamp = str(int(time.time()))
    signed_payload = f"{timestamp}.{payload}"
    
    signature = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"sha256={signature}", timestamp
```

```javascript
// JavaScript signature verification
async function verifySignature(secret, payload, signature, timestamp) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signedPayload = `${timestamp}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );
  
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const expected = signature.replace('sha256=', '');
  return computed === expected;
}
```

### C. Rate Limit Tiers (Detailed)

| Tier | Monthly Cost | Requests/Min | Burst | Batch | Webhooks | Support |
|------|-------------|--------------|-------|-------|----------|---------|
| Free | $0 | 60 | 10 | No | 1/min | Community |
| Basic | $49 | 300 | 50 | Yes (10) | 10/min | Email |
| Pro | $199 | 1,000 | 200 | Yes (100) | 60/min | Priority |
| Enterprise | Custom | 5,000+ | 500+ | Unlimited | 300+/min | Dedicated |

---

**Document Status**: Draft v0.1.1  
**Next Review**: 2026-05-01  
**Owner**: Platform Engineering Team
