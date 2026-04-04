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
  "version": "0.2.0",
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
  "version": "0.2.0",
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

### POST /api/research

Research referral codes for a specific domain or query.

**Request Body:**

```json
{
  "query": "trading212 referral code",
  "domain": "trading212.com",
  "depth": "thorough",
  "sources": ["all"],
  "max_results": 20,
  "options": {
    "use_real_fetching": false
  }
}
```

**Parameters:**

- `query` (string, required): Search query for referral codes
- `domain` (string, optional): Target domain to search for
- `depth` (string, optional): Research depth - 'quick', 'thorough', or 'deep' (default: 'quick')
- `sources` (array, optional): Sources to search - 'all' or specific sources like ['producthunt', 'reddit', 'hackernews', 'github']
- `max_results` (number, optional): Maximum results to return (default: 10, max: 100)
- `options.use_real_fetching` (boolean, optional): Enable real web fetching (default: false, uses simulation)

**Response:**

```json
{
  "query": "trading212 referral code",
  "domain": "trading212.com",
  "discovered_codes": [
    {
      "code": "ABC123XYZ",
      "url": "https://trading212.com/invite/ABC123XYZ",
      "source": "known_pattern:trading212.com",
      "discovered_at": "2024-03-31T12:00:00Z",
      "reward_summary": "Free share worth up to £100",
      "confidence": 0.85
    }
  ],
  "research_metadata": {
    "sources_checked": ["known_pattern:trading212.com", "producthunt", "reddit"],
    "search_queries": ["trading212 referral", "trading212 invite"],
    "research_duration_ms": 1250,
    "agent_id": "research-agent-1711886400000",
    "used_real_fetching": false
  }
}
```

**Research Sources:**

When `sources` is set to `["all"]` or specific sources, the system searches:

- `known_pattern`: Known referral programs with defined patterns (e.g., trading212.com)
- `producthunt`: Product Hunt for product referral programs
- `reddit`: Reddit discussions about referral codes
- `hackernews`: Hacker News referral discussions
- `github`: GitHub repositories with referral documentation
- `company_site`: Direct company website scraping

**Real vs Simulated Fetching:**

By default (`use_real_fetching: false`), the system uses simulation to generate realistic referral codes based on known patterns. When enabled:

- The system fetches real web content from the specified sources
- Extracts referral codes using pattern matching
- Returns actual discovered codes with confidence scores
- Falls back to simulation if fetching fails

**Rate Limiting:**

Research requests are rate-limited per source (10 requests per minute per source). When rate limited, the system returns a 429 status with retry information.

**Status Codes:**

- 200: Research completed successfully
- 400: Invalid request parameters
- 429: Rate limited - retry after specified time
- 500: Research failed

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

---

## Referral API

Manage referral codes with full CRUD operations and research capabilities.

### GET /api/referrals

Search and list referral codes with filtering.

**Query Parameters:**

- `domain` (string): Filter by domain (e.g., 'trading212.com')
- `status` (string): Filter by status - 'active', 'inactive', 'expired', 'all' (default: 'all')
- `category` (string): Filter by category
- `source` (string): Filter by source - 'api', 'mcp_agent', 'research', 'all' (default: 'all')
- `limit` (number): Max results to return (default: 100, max: 1000)
- `offset` (number): Pagination offset (default: 0)

**Response:**

```json
{
  "referrals": [
    {
      "id": "abc123-sha256",
      "code": "GcCOCxbo",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "domain": "trading212.com",
      "status": "active",
      "source": "api",
      "submitted_at": "2024-03-31T12:00:00Z",
      "metadata": {
        "title": "Trading212 Referral",
        "description": "Free share worth up to £100",
        "reward_type": "item",
        "reward_value": "Free share worth up to £100",
        "category": ["finance", "investing"],
        "confidence_score": 0.85
      }
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

---

### POST /api/referrals

Create a new referral code.

**Request Body:**

```json
{
  "code": "MYCODE123",
  "url": "https://example.com/invite/MYCODE123",
  "domain": "example.com",
  "source": "api",
  "submitted_by": "user@example.com",
  "expires_at": "2024-12-31T23:59:59Z",
  "metadata": {
    "title": "Example Referral",
    "description": "Get $10 off your first purchase",
    "reward_type": "cash",
    "reward_value": 10,
    "currency": "USD",
    "category": ["shopping"],
    "tags": ["new-user", "signup"],
    "requirements": ["New users only", "Min purchase $50"],
    "confidence_score": 0.9,
    "notes": "Verified referral program"
  }
}
```

**Required Fields:**
- `code` (string): The referral code
- `url` (string): Full referral URL
- `domain` (string): Domain name

**Optional Fields:**
- `source` (string): Source of the referral (default: 'api')
- `submitted_by` (string): Who submitted the referral
- `expires_at` (string): ISO 8601 expiration date
- `metadata` (object): Additional metadata

**Response (201 Created):**

```json
{
  "success": true,
  "message": "Referral created successfully",
  "referral": {
    "id": "generated-sha256-id",
    "code": "MYCODE123",
    "url": "https://example.com/invite/MYCODE123",
    "domain": "example.com",
    "status": "quarantined"
  }
}
```

**Status Codes:**

- 201: Created successfully
- 400: Validation failed
- 409: Referral code already exists
- 413: Request body too large (>1MB)
- 415: Content-Type must be application/json

---

### GET /api/referrals/:code

Get a specific referral by code.

**Parameters:**

- `code` (string): The referral code to look up

**Response:**

```json
{
  "referral": {
    "id": "abc123-sha256",
    "code": "GcCOCxbo",
    "url": "https://trading212.com/invite/GcCOCxbo",
    "domain": "trading212.com",
    "status": "active",
    "source": "api",
    "submitted_at": "2024-03-31T12:00:00Z",
    "submitted_by": "api",
    "expires_at": "2024-12-31T23:59:59Z",
    "deactivated_at": null,
    "deactivated_reason": null,
    "replaced_by": null,
    "description": "Referral code for trading212.com",
    "metadata": {
      "title": "Trading212 Referral",
      "description": "Free share worth up to £100",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "currency": "GBP",
      "category": ["finance", "investing"],
      "tags": ["verified", "high-value"],
      "requirements": ["New users only"],
      "confidence_score": 0.85,
      "notes": "Verified referral program"
    },
    "validation": {
      "last_validated": "2024-03-31T12:00:00Z",
      "status": "valid"
    }
  }
}
```

**Status Codes:**

- 200: Success
- 404: Referral not found

---

### POST /api/referrals/:code/deactivate

Deactivate a referral code.

**Parameters:**

- `code` (string): The referral code to deactivate

**Request Body:**

```json
{
  "reason": "expired",
  "replaced_by": "NEWCODE456",
  "notes": "Code expired, replaced with new code"
}
```

**Required Fields:**
- `reason` (string): Why the code is being deactivated

**Optional Fields:**
- `replaced_by` (string): New code that replaces this one
- `notes` (string): Additional notes

**Response:**

```json
{
  "success": true,
  "message": "Referral deactivated successfully",
  "referral": {
    "id": "abc123-sha256",
    "code": "GcCOCxbo",
    "url": "https://trading212.com/invite/GcCOCxbo",
    "domain": "trading212.com",
    "status": "inactive",
    "deactivated_at": "2024-04-01T10:30:00Z",
    "reason": "expired",
    "replaced_by": "NEWCODE456"
  }
}
```

**Status Codes:**

- 200: Deactivated successfully
- 400: Invalid request
- 404: Referral not found

---

### POST /api/research

Research referral codes for a specific domain or query.

**Request Body:**

```json
{
  "query": "trading212 referral code",
  "domain": "trading212.com",
  "depth": "thorough",
  "sources": ["all"],
  "max_results": 20,
  "options": {
    "use_real_fetching": false
  }
}
```

**Parameters:**

- `query` (string, required): Search query for referral codes
- `domain` (string, optional): Target domain to search for
- `depth` (string, optional): Research depth - 'quick', 'thorough', or 'deep' (default: 'quick')
- `sources` (array, optional): Sources to search - 'all' or specific sources
- `max_results` (number, optional): Maximum results (default: 10, max: 100)
- `options.use_real_fetching` (boolean, optional): Enable real web fetching (default: false)

**Response:**

```json
{
  "success": true,
  "message": "Research completed",
  "query": "trading212 referral code",
  "domain": "trading212.com",
  "discovered_codes": 5,
  "stored_referrals": 3,
  "research_metadata": {
    "sources_checked": ["known_pattern:trading212.com", "producthunt", "reddit"],
    "search_queries": ["trading212 referral", "trading212 invite"],
    "research_duration_ms": 1250,
    "agent_id": "research-agent-1711886400000",
    "used_real_fetching": false
  }
}
```

**Research Sources:**

When `sources` is set to `["all"]` or specific sources, the system searches:

- `known_pattern`: Known referral programs with defined patterns
- `producthunt`: Product Hunt for product referral programs
- `reddit`: Reddit discussions about referral codes
- `hackernews`: Hacker News referral discussions
- `github`: GitHub repositories with referral documentation
- `company_site`: Direct company website scraping

**Status Codes:**

- 200: Research completed
- 400: Invalid request
- 415: Content-Type must be application/json
- 500: Research failed

---

## D1 Database API

Advanced database queries, full-text search, and statistics via D1 SQL database.

### GET /api/d1/search

Full-text search deals using FTS5 (Full-Text Search).

**Query Parameters:**

- `q` (string, required): Search query
- `limit` (number): Max results (default: 20)
- `include_expired` (boolean): Include expired deals (default: false)
- `status` (string): Filter by status ('active', 'inactive', 'expired', 'quarantined')

**Response:**

```json
{
  "success": true,
  "query": "trading212 free share",
  "count": 5,
  "results": [
    {
      "id": "sha256-hash",
      "code": "GcCOCxbo",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "domain": "trading212.com",
      "title": "Trading212 Referral",
      "description": "Free share worth up to £100",
      "status": "active",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "categories": ["finance", "investing"],
      "confidence_score": 0.85,
      "submitted_at": "2024-03-31T12:00:00Z",
      "expires_at": "2024-12-31T23:59:59Z",
      "rank": 0.95
    }
  ]
}
```

**FTS5 Query Syntax:**

- Simple terms: `q=trading212` - matches any field containing "trading212"
- Phrases: `q="free share"` - exact phrase match
- AND: `q=trading212 AND investing` - both terms must match
- OR: `q=trading212 OR scalable` - either term matches
- NOT: `q=trading212 NOT expired` - exclude matches
- Prefix: `q=trad*` - prefix matching

**Example Queries:**

```bash
# Simple search
curl "https://your-worker.workers.dev/api/d1/search?q=trading212"

# Phrase search
curl "https://your-worker.workers.dev/api/d1/search?q=%22free%20share%22"

# Active deals only
curl "https://your-worker.workers.dev/api/d1/search?q=finance&status=active"

# Include expired
curl "https://your-worker.workers.dev/api/d1/search?q=crypto&include_expired=true"
```

---

### GET /api/d1/suggestions

Get search suggestions for autocomplete (requires at least 2 characters).

**Query Parameters:**

- `q` (string, required): Partial query (min 2 characters)
- `limit` (number): Max suggestions (default: 10)

**Response:**

```json
{
  "success": true,
  "query": "trad",
  "suggestions": [
    "trading212",
    "trading",
    "trade republic",
    "trader"
  ]
}
```

**Example:**

```bash
curl "https://your-worker.workers.dev/api/d1/suggestions?q=trad&limit=5"
```

---

### GET /api/d1/stats

Get comprehensive database statistics.

**Response:**

```json
{
  "success": true,
  "stats": {
    "total_deals": 150,
    "active_deals": 120,
    "expired_deals": 20,
    "quarantined_deals": 10,
    "total_referral_codes": 150,
    "avg_confidence_score": 0.78,
    "top_category": "finance",
    "top_source": "api",
    "deals_added_last_7_days": 15,
    "deals_added_last_30_days": 45,
    "deals_expiring_next_7_days": 5,
    "deals_expiring_next_30_days": 18
  }
}
```

---

### GET /api/d1/deals

Advanced deal filtering with multiple criteria.

**Query Parameters:**

- `domain` (string): Filter by domain
- `category` (string): Filter by category
- `status` (string): Filter by status (default: 'active')
- `limit` (number): Max results (default: 50)
- `min_confidence` (number): Minimum confidence score (0-1)
- `expiring_in` (number): Days until expiration (gets deals expiring within N days)

**Response:**

```json
{
  "success": true,
  "count": 10,
  "metadata": {
    "filter": {
      "type": "domain",
      "domain": "trading212.com"
    }
  },
  "results": [
    {
      "id": "sha256-hash",
      "code": "GcCOCxbo",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "domain": "trading212.com",
      "title": "Trading212 Referral",
      "status": "active",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "confidence_score": 0.85,
      "expires_at": "2024-12-31T23:59:59Z"
    }
  ]
}
```

**Example Queries:**

```bash
# By domain
curl "https://your-worker.workers.dev/api/d1/deals?domain=trading212.com"

# By category with confidence filter
curl "https://your-worker.workers.dev/api/d1/deals?category=finance&min_confidence=0.8"

# Expiring soon
curl "https://your-worker.workers.dev/api/d1/deals?expiring_in=7"

# All statuses
curl "https://your-worker.workers.dev/api/d1/deals?status=all&limit=100"
```

---

### GET /api/d1/domains

List all domains with deal counts.

**Response:**

```json
{
  "success": true,
  "count": 25,
  "domains": [
    {
      "domain": "trading212.com",
      "deal_count": 3,
      "active_count": 2,
      "expired_count": 1
    },
    {
      "domain": "scalable.capital",
      "deal_count": 2,
      "active_count": 2,
      "expired_count": 0
    }
  ]
}
```

---

### GET /api/d1/categories

List all categories with deal counts.

**Response:**

```json
{
  "success": true,
  "count": 8,
  "categories": [
    {
      "name": "finance",
      "display_name": "Finance & Banking",
      "deal_count": 45,
      "description": "Financial services and banking deals"
    },
    {
      "name": "shopping",
      "display_name": "Shopping",
      "deal_count": 30,
      "description": "Retail and e-commerce deals"
    }
  ]
}
```

---

### GET /api/d1/migrations

Get database migration status or initialize database.

**Query Parameters:**

- `action` (string): Set to 'init' to initialize database

**Response (Status):**

```json
{
  "success": true,
  "status": {
    "currentVersion": 3,
    "latestVersion": 3,
    "pendingCount": 0,
    "pending": [],
    "appliedCount": 3
  }
}
```

**Response (Initialize):**

```json
{
  "success": true,
  "message": "Database initialized to version 3",
  "applied": [1, 2, 3],
  "error": null
}
```

**Example:**

```bash
# Check status
curl "https://your-worker.workers.dev/api/d1/migrations"

# Initialize database
curl "https://your-worker.workers.dev/api/d1/migrations?action=init"
```

---

### GET /api/d1/health

Check D1 database health and connectivity.

**Response:**

```json
{
  "success": true,
  "healthy": true,
  "status": {
    "connected": true,
    "currentVersion": 3,
    "latestVersion": 3,
    "pendingMigrations": 0
  }
}
```

---

## Multi-Agent Workflow API

⚠️ **Coming Soon** - The workflow API is planned for a future release.

The multi-agent workflow system will provide:
- 4-phase coordinated execution (Verification → Testing → Git → Fixes)
- Event-driven orchestration with quality gates
- Automatic retry logic and graceful degradation

For current pipeline operations, use `/api/discover` and `/api/status` endpoints.

---
