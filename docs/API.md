# API Documentation

## Base URL

Production: `https://your-worker.workers.dev`

## Authentication

No authentication required for public endpoints.
For admin endpoints (future), API key via header: `X-API-Key: your-key`

## Endpoints

### GET /health

Check system health status.

**Response:**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2024-03-31T12:00:00Z",
  "checks": {
    "kv_connection": true,
    "last_run_success": true,
    "snapshot_valid": true
  }
}

---

### GET /deals/ranked

Get ranked and sorted deals with composite scoring.

**Query Parameters:**

- `sort_by` (string): Sort field - 'confidence', 'recency', 'value', 'expiry', 'trust' (default: 'confidence')
- `order` (string): Sort order - 'asc' or 'desc' (default: 'desc')
- `limit` (number): Max deals to return (default: 50, max: 1000)
- `min_confidence` (number): Minimum confidence score filter
- `min_trust` (number): Minimum trust score filter (0-1)
- `category` (string): Filter by category
- `include_scores` (boolean): Include score breakdown in response

**Response:**

```json
{
  "deals": [...],
  "meta": {
    "total": 100,
    "filtered": 45,
    "returned": 50,
    "sort_by": "confidence",
    "order": "desc"
  },
  "scores": [
    {
      "dealId": "sha256-hash",
      "score": 85.5,
      "breakdown": {
        "confidence": 85,
        "trust": 90,
        "recency": 75,
        "value": 80,
        "expiry": 90
      }
    }
  ]
}
```

---

### GET /deals/highlights

Get highlighted deals (top, expiring soon, recently added).

**Query Parameters:**

- `limit` (number): Deals per category (default: 5)

**Response:**

```json
{
  "top_deals": [...],
  "expiring_soon": [...],
  "recently_added": [...],
  "meta": {
    "top_deals_count": 5,
    "expiring_soon_count": 3,
    "recently_added_count": 8
  }
}
```

---

### GET /api/analytics

Get comprehensive deal analytics and insights.

**Query Parameters:**

- `days` (number): Time period for analysis (default: 30, max: 90)
- `format` (string): 'json' or 'summary' (default: 'json')

**Response (JSON format):**

```json
{
  "dealsOverTime": [
    { "date": "2024-03-24", "discovered": 5, "published": 4, "expired": 1 }
  ],
  "categoryBreakdown": [
    { "category": "finance", "count": 25, "avgConfidence": 0.82, "avgValue": 45 }
  ],
  "sourcePerformance": [
    { "domain": "trading212.com", "dealsDiscovered": 10, "trustScore": 0.9 }
  ],
  "valueDistribution": [
    { "range": "0-25", "count": 15, "percentage": 30 }
  ],
  "expiringSoon": {
    "next7Days": 3,
    "next30Days": 12,
    "next90Days": 28
  },
  "qualityMetrics": {
    "avgConfidence": 0.78,
    "validationSuccessRate": 0.95,
    "duplicateRate": 0.05
  }
}
```

**Response (Summary format):**

```json
{
  "total_deals": 100,
  "active_deals": 85,
  "avg_deals_per_day": 3.5,
  "total_value": 2500,
  "unique_sources": 12,
  "discovery_rate": 3.2
}
```

---

### GET /deals

Get active deals (filtered array).

**Query Parameters:**

- `category` (string): Filter by category (e.g., 'trading', 'crypto')
- `min_reward` (number): Minimum reward value
- `limit` (number): Max deals to return (default: 100, max: 1000)

**Response:**

```json
[
  {
    "id": "sha256-hash",
    "title": "Trading212",
    "code": "GcCOCxbo",
    "url": "https://trading212.com/invite/GcCOCxbo",
    "reward": {
      "type": "item",
      "value": "Free share worth up to £100"
    },
    "metadata": {
      "confidence_score": 0.85,
      "status": "active"
    }
  }
]
```

---

### GET /deals.json

Get full snapshot with metadata.

**Response:**

```json
{
  "version": "0.1.0",
  "generated_at": "2024-03-31T12:00:00Z",
  "run_id": "deals-2024-03-31-12",
  "snapshot_hash": "abc123...",
  "stats": {
    "total": 50,
    "active": 45,
    "quarantined": 3,
    "rejected": 2
  },
  "deals": [...]
}
```

---

### GET /metrics

Prometheus-compatible metrics.

**Response:**

```
# HELP deals_runs_total Total discovery runs
deals_runs_total 42

# HELP deals_active_deals Current active deals
deals_active_deals 45
```

**Content-Type:** `text/plain`

---

### POST /api/discover

Trigger manual discovery (triggers pipeline).

**Response:**

```json
{
  "success": true,
  "message": "Discovery pipeline triggered"
}
```

**Status Codes:**

- 200: Pipeline triggered
- 409: Another run in progress
- 500: Pipeline failed

---

### GET /api/status

Get current pipeline status.

**Response:**

```json
{
  "locked": false,
  "current_run": null,
  "last_run": {
    "run_id": "deals-2024-03-31-12",
    "timestamp": "2024-03-31T12:00:00Z",
    "success": true
  }
}
```

---

### GET /api/log

Get research logs.

**Query Parameters:**

- `run_id` (string): Get logs for specific run
- `count` (number): Number of recent logs (default: 100)
- `format` (string): 'json' or 'jsonl' (default: json)

**Response (JSON):**

```json
{
  "logs": [
    {
      "run_id": "deals-2024-03-31-12",
      "phase": "discover",
      "status": "complete",
      "candidate_count": 15
    }
  ],
  "count": 1
}
```

**Response (JSONL):**

```
{"run_id":"...","phase":"discover","status":"complete"}
{"run_id":"...","phase":"validate","status":"complete"}
```

---

### POST /api/submit

Submit a new deal for validation.

**Request Body:**

```json
{
  "url": "https://example.com/invite/CODE123",
  "code": "CODE123",
  "source": "example.com",
  "metadata": {}
}
```

**Response:**

```json
{
  "success": true,
  "message": "Deal submitted for review",
  "code": "CODE123"
}
```

**Status Codes:**

- 202: Submitted for review
- 400: Invalid request
- 409: Deal already exists

## Error Responses

All errors follow this format:

```json
{
  "error": "Error description",
  "message": "Detailed message"
}
```

**Status Codes:**

- 400: Bad Request
- 404: Not Found
- 409: Conflict
- 429: Rate Limited
- 500: Internal Server Error

## Rate Limiting

- 100 requests per minute per IP
- Exceeded limit returns 429 status
- Retry-After header included

## CORS

All endpoints support CORS:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Tool Definitions (for AI Agents)

### get_deals

```json
{
  "name": "get_deals",
  "description": "Retrieve active referral deals",
  "parameters": {
    "type": "object",
    "properties": {
      "category": { "type": "string" },
      "min_reward": { "type": "number" },
      "limit": { "type": "number", "default": 100 }
    }
  }
}
```

### get_deal_by_code

```json
{
  "name": "get_deal_by_code",
  "description": "Find deal by referral code",
  "parameters": {
    "type": "object",
    "properties": {
      "code": { "type": "string" }
    },
    "required": ["code"]
  }
}
```

### submit_deal

```json
{
  "name": "submit_deal",
  "description": "Submit a discovered deal",
  "parameters": {
    "type": "object",
    "properties": {
      "url": { "type": "string" },
      "code": { "type": "string" },
      "source": { "type": "string" }
    },
    "required": ["url", "code"]
  }
}
```
